#!/usr/bin/env node
/* =============================================================================
   CAPREBATE REGRESSION HARNESS
   Board item 12840997835. Written by Phase 2 (Taxonomy & Election Core).

   WHAT IT DOES
     Asserts every Rulebook B truth-table row (A1-E4, including the new
     C2a-C2d), every Module C election rule and every Module D taxonomy rule
     against the LIVE artefacts - not against a copy of them:

       caprebate-site.html               the shipped engine
       Caprebate-Fixture-Taxonomy-v1.csv the taxonomy                 } both read from
       Module-0*.md                        the sector specifications  } 02-modules-and-build-prep/
                                                                        (Phase 132g)

   HOW IT REACHES THE ENGINE
     The five sector modules are IIFEs with no exports. The harness lifts each
     body out of the source and re-wraps it so runEngine can be called
     directly. Nothing in the source is modified to make it testable, so the
     harness tests the file that actually ships. A small DOM stub is supplied
     because the IIFEs touch document at load time; runEngine itself does not.

   xfail
     Several rows are defects that are already logged on the board and are NOT
     in Phase 2's scope. Asserting them as ordinary failures would leave the
     harness permanently red and useless. They are declared xfail with their
     board item id: the harness confirms the defect still behaves as described,
     and FAILS LOUDLY IF ONE STARTS PASSING - which means someone fixed it and
     this file needs updating. A silent xfail that has quietly started passing
     is how a harness stops being evidence of anything.

   RUN
     node caprebate-regression.cjs            all suites
     node caprebate-regression.cjs --suite D  one suite
     node caprebate-regression.cjs --verbose  every assertion, not just fails

   EXIT
     0  everything expected passed, every xfail still fails as expected
     1  an unexpected failure, or an xfail that has started passing
   ============================================================================= */

"use strict";
const fs = require("fs");
const path = require("path");

const DIR = __dirname;
/* RENAMED AND MOVED 3 SEPTEMBER 2026 (Phase 71).
   `03-app/caprebate-site.html` is now `<Desktop>/Caprebate site.html`.

   It was MOVED, not copied. This project already carries one forked lineage of
   the site file and a second would be worse than the rename — so there is still
   exactly one, and this is the path to it.

   The taxonomy CSV and the phase folders have NOT moved and are still resolved
   from DIR. Only the site file left.

   THE FOUR-BUCKET RULE IS RETIRED, 4 SEPTEMBER 2026 (PHASE 78). It said code
   identifiers and internal filenames stayed as they were, because renaming
   them breaks two NTFS junctions, every path in the file index and this
   harness's own invocation. Lakhbir overruled it — "i want everything fixed" —
   so the rename went all the way: 58 files moved, ~960 `LS_` identifiers
   became `CB_`, and the junctions were repointed. All three suites were run
   before the identifier swap, again after it and before anything moved, and
   again after the moves. If you are reading this because a path broke, the
   junctions are the first thing to check: traverse them, do not read them. */
const SITE = path.join(DIR, "..", "..", "Caprebate site.html");

/* PHASE_DIR — where phase3/ and phase9/ actually are ON THIS MACHINE.
   03-app/phase3 and 03-app/phase9 are NTFS JUNCTIONS into 04-phase-work.
   OneDrive does not sync a junction: on the Mac copy of this tree both are
   EMPTY FOLDERS, so five requires below resolved to nothing and Suites I, J
   and K reported the modules as missing rather than as failing. Nothing about
   the suites was wrong; the link was. So resolve to whichever of the two
   locations actually holds the files, on either machine, and traverse to find
   out rather than reading the link. On the Acer the junction is populated and
   this returns "." — behaviour there is unchanged. (Phase 96, 7 Sep 2026.) */
function phaseDir(name) {
  try { if (fs.readdirSync(path.join(DIR, name)).length) return "./" + name; }
  catch (e) { /* not there at all */ }
  return "../04-phase-work/" + name;
}
const P3 = phaseDir("phase3"), P9 = phaseDir("phase9");
/* PHASE 132g, 16 September 2026 - THE LIVE COPIES. The six Module-*.md
   specifications and the taxonomy CSV exist twice: in 02-modules-and-build-prep/
   (the copy that is edited) and in 03-app/ (an older copy kept beside this
   file). This harness read the 03-app/ copy, so an edit to the live one was
   never tested. It now reads 02-modules-and-build-prep/, resolved from DIR as
   every other path here is. The 03-app/ copies are no longer read by any
   script; caprebate-figure-drift.cjs still compares the pairs until Lakhbir
   deletes the 03-app/ copies. */
const MODULES_DIR = path.join(DIR, "..", "02-modules-and-build-prep");
const TAX = path.join(MODULES_DIR, "Caprebate-Fixture-Taxonomy-v1.csv");

const argv = process.argv.slice(2);
const VERBOSE = argv.includes("--verbose");
const ONLY = (function () { const i = argv.indexOf("--suite"); return i >= 0 ? argv[i + 1] : null; })();

/* ═══ WHICH ENGINE IS UNDER TEST ═══════════════════════ PHASE 102, 8 SEP 2026

   Phase 102 lifted the estimate engine out of "Caprebate site.html" into a
   package at 09-app/engine. This harness can now run against EITHER, and the
   whole point is that it runs against BOTH:

     node 03-app/caprebate-regression.cjs             the site file  (default)
     node 03-app/caprebate-regression.cjs --package   the package
     CAPREBATE_ENGINE=package node 03-app/...         the same, by environment

   THERE IS NO CUT-OVER, DELIBERATELY. A harness that only tested the package
   could not tell you the package still matches the file, which is the one
   thing the extraction has to prove. The totals from the two runs must MATCH;
   a difference means the extraction changed a tax answer, and that is the
   finding, not an obstacle.

   WHAT DOES NOT MOVE. Suites that assert on the PAGE's own text - the brand
   name, no payment processors, the served-jurisdiction sentence - still read
   the site file in both modes. They are website-copy checks, not engine
   checks, and the package is not where that copy lives. */
const USE_PACKAGE = argv.includes("--package") || process.env.CAPREBATE_ENGINE === "package";

/* RESOLVE THE PACKAGE BY TRAVERSAL, NEVER BY READING A LINK - the same rule
   phaseDir() follows above, and for the same reason: OneDrive flattens the
   NTFS junctions on the Mac, and a resolver that trusts a path it has not
   looked inside reports modules MISSING when the truth is a broken link. */
function packageDir() {
  const tries = [path.join(DIR, "..", "09-app", "engine"), path.join(DIR, "09-app", "engine")];
  for (const c of tries) {
    try { if (fs.readdirSync(path.join(c, "src", "generated")).length) return c; }
    catch (e) { /* not there */ }
  }
  return null;
}
const PKG = USE_PACKAGE ? packageDir() : null;
if (USE_PACKAGE && !PKG) {
  console.error("FATAL: --package was asked for but 09-app/engine/src/generated is empty or missing.\n" +
                "       Run: node 09-app/engine/tools/extract.cjs");
  process.exit(1);
}

/* The fences the extractor writes round the verbatim slice and round the four
   lines of renderer shim, so this harness can recover either. */
const PKG_SLICE = ["/* @@CAPREBATE-SLICE-OPEN@@ */", "/* @@CAPREBATE-SLICE-CLOSE@@ */"];
const PKG_SHIM = ["/* @@CAPREBATE-SHIM-OPEN@@ */", "/* @@CAPREBATE-SHIM-CLOSE@@ */"];
function pkgFenced(file, fence) {
  const t = fs.readFileSync(path.join(PKG, "src", "generated", file), "utf8");
  const a = t.indexOf(fence[0]), b = t.indexOf(fence[1]);
  if (a < 0 || b < 0) throw new Error("no " + fence[0] + " fence in " + file);
  return t.slice(a + fence[0].length + 1, b - 1);
}


/* ---------------------------------------------------------------- reporting */
const results = { pass: 0, fail: 0, xfail: 0, xpass: 0 };
const failures = [];
let suite = "";

function startSuite(id, title) {
  suite = id;
  if (ONLY && ONLY !== id) return false;
  console.log("\n── " + id + ". " + title + " " + "─".repeat(Math.max(0, 62 - title.length)));
  return true;
}

function check(name, actual, expected, opts) {
  opts = opts || {};
  const ok = deepEqual(actual, expected);
  if (opts.xfail) {
    if (ok) {
      results.xpass++;
      failures.push({ suite, name, note: "XPASS — this defect was expected to still be present (" + opts.xfail + "). It now behaves correctly, so the harness needs updating." });
      console.log("  XPASS  " + name + "\n         was xfail against " + opts.xfail + " — UPDATE THIS HARNESS");
    } else {
      results.xfail++;
      console.log("  xfail  " + name + "\n         known defect " + opts.xfail + " confirmed still present");
    }
    return;
  }
  if (ok) {
    results.pass++;
    if (VERBOSE) console.log("  pass   " + name);
  } else {
    results.fail++;
    failures.push({ suite, name, expected: show(expected), actual: show(actual) });
    console.log("  FAIL   " + name + "\n         expected " + show(expected) + "\n         actual   " + show(actual));
  }
}

function show(v) { return typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v); }
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === "object") return JSON.stringify(a) === JSON.stringify(b);
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-9;
  return false;
}

/* ------------------------------------------------------------ load the site */
const src = fs.readFileSync(SITE, "utf8");

function scriptBodies() {
  const out = []; const re = /<script[^>]*>([\s\S]*?)<\/script>/g; let m;
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
}
const bodies = scriptBodies();
const engineBody = bodies.find(b => b.indexOf("CB_ELECTION") !== -1);
if (!engineBody) { console.error("FATAL: cannot find the engine script block"); process.exit(1); }

/* the shared layer sits between CB_PLANT and the first sector IIFE */
let layerSrc = engineBody.slice(engineBody.indexOf("var CB_PLANT"), engineBody.indexOf("/* ===== care_homes"));
/* PHASE 72 — CB_BAND and CB_FUNNEL join the shared layer. CB_FUNNEL is pure:
   it holds the flow's state shape, the figure arithmetic and the assumptions
   list, and it touches no DOM, which is exactly why it can be asserted here.
   The renderer that draws it (`FN`) is deliberately NOT lifted — it is DOM
   code, and lifting it would mean stubbing a browser to test a layout. */
/* PHASE 102 - in package mode the layer TEXT comes from the package file
   instead of the page. The extraction verifier proves the two are byte for
   byte the same, so this changes nothing except which artefact is on trial.
   Only Suite H, which forces CTA switches on by rewriting the text, needs it;
   LAYER and ENGINES below are `require`d from the package as a consumer would. */
if (USE_PACKAGE) layerSrc = pkgFenced("shared.js", PKG_SLICE);

const LAYER = USE_PACKAGE
  ? require(path.join(PKG, "src", "generated", "shared.js"))
  : new Function(layerSrc + "; return {CB_PLANT:CB_PLANT, CB_POOL:CB_POOL, CB_S25:CB_S25, CB_ELECTION:CB_ELECTION, CB_RATES:CB_RATES, CB_S187A:CB_S187A, CB_JURIS:CB_JURIS, CB_REGISTRY:CB_REGISTRY, CB_FRONTDOOR:CB_FRONTDOOR, CB_FEE:CB_FEE, CB_FEEGUARD:CB_FEEGUARD, CB_BENEFIT:CB_BENEFIT, CB_GATE_CONFIG:CB_GATE_CONFIG, CB_GATE:CB_GATE, CB_BOOKING:CB_BOOKING, CB_BAND:CB_BAND, CB_FUNNEL:CB_FUNNEL, CB_CASH:CB_CASH, CB_ACQ:CB_ACQ, CB_TAXPOS:CB_TAXPOS, CB_CTA:CB_CTA};")();
const { CB_PLANT, CB_POOL, CB_S25, CB_ELECTION, CB_RATES, CB_S187A, CB_JURIS, CB_REGISTRY, CB_FRONTDOOR, CB_FEE, CB_FEEGUARD, CB_BENEFIT, CB_GATE_CONFIG, CB_GATE, CB_BOOKING, CB_BAND, CB_FUNNEL, CB_CASH, CB_ACQ, CB_TAXPOS } = LAYER;

/* --------------------------------------------------- lift the sector engines */
const SECTORS = ["care_homes", "dental", "supported_living", "gp", "private_hospital"];
/* PHASE 113d - the four sectors the job-economics cost base actually holds.
   Supported living has no cost row there and is deliberately not invented. */
const SECTORS_ECON = ["dental", "gp", "care_home", "private_hospital"];

function domStub() {
  const el = {
    style: {}, dataset: {}, files: null, value: "", textContent: "", innerHTML: "", disabled: false,
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    querySelectorAll() { return []; }, querySelector() { return null; }, focus() {}, closest() { return el; },
    appendChild() {}, click() {}
  };
  return {
    getElementById() { return el; }, querySelector() { return null; }, querySelectorAll() { return []; },
    createElement() { return el; }, addEventListener() {}, body: el
  };
}

function liftEngine(sector) {
  const marker = "/* ===== " + sector + " ===== */";
  const start = engineBody.indexOf(marker);
  if (start < 0) throw new Error("sector block not found: " + sector);
  const open = engineBody.indexOf("(function(){", start);
  const reg = engineBody.indexOf('RS["' + sector + '"]=', open);
  const close = engineBody.indexOf("})();", reg);
  if (open < 0 || reg < 0 || close < 0) throw new Error("cannot bound IIFE for " + sector);
  const body = engineBody.slice(open + "(function(){".length, close);

  /* the shared layer plus this sector body, re-wrapped so the internals come
     back out. Nothing in the source is edited to allow this. */
  const wrapped =
    "var document = __doc, window = __win, RS = {}, SECTORS = {};\n" +
    layerSrc + "\n" +
    "return (function(){\n" + body +
    "\n return { runEngine: (typeof runEngine==='function') ? runEngine : null," +
    "          Q: (typeof Q!=='undefined') ? Q : null," +
    "          YIELD_BAND: (typeof YIELD_BAND!=='undefined') ? YIELD_BAND : null," +
    "          pushFlag: (typeof pushFlag==='function') ? pushFlag : null };\n})();";
  const doc = domStub();
  return new Function("__doc", "__win", wrapped)(doc, { addEventListener() {}, location: { href: "" } });
}

const ENGINES = {};
let liftError = null;
try {
  SECTORS.forEach(s => {
    /* PHASE 102 - in package mode the engine is REQUIRED, not lifted. That is
       deliberate: requiring it exercises the real module boundary a developer
       will use, and it needs no DOM stub at all, which is itself part of what
       the extraction promised. */
    ENGINES[s] = USE_PACKAGE
      ? require(path.join(PKG, "src", "generated", "sector-" + s + ".js"))
      : liftEngine(s);
  });
}
catch (e) { liftError = e; }

/* --------------------------------------------------------- load the taxonomy */
function loadCsv(file) {
  const lines = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").split("\n").filter(l => l.trim().length);
  const head = splitRow(lines[0]);
  return lines.slice(1).map(l => {
    const c = splitRow(l), o = {};
    head.forEach((h, i) => { o[h] = (c[i] === undefined ? "" : c[i]); });
    return o;
  });
}
function splitRow(line) {
  const out = []; let cur = "", q = false;
  for (const ch of line) {
    if (ch === '"') { q = !q; }
    else if (ch === "," && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur); return out;
}
const TAXONOMY = loadCsv(TAX);

/* =============================================================================
   SUITE A - taxonomy invariants (D-1, D-2, D-3, D-4, D-6, D-7)
   ============================================================================= */
if (startSuite("A", "Taxonomy invariants — Module D")) {

  // 103, not 100: three later rows were added to the original 100.
  // E-7 (board item 12851784947) split LS-SL-001 into LS-SL-001
  // (electrical/cold-water) and LS-SL-001b (heating/hot-water/ventilation) so a
  // boiler serving the dwellings and corridor lighting sharing one plant room can
  // carry opposite serves_dwellings answers instead of one bundled row.
  // Taxonomy defect B3 then added LS-CH-015 (the care-home loose-equipment
  // chattel bundle the other four sectors already carried) and taxonomy defect
  // F-8 added LS-DEN-015 (the LDU / treatment-room negative-pressure extract,
  // which before it existed defaulted silently into LS-SR-004). Both landed on
  // 29 Aug 2026 without this assertion, D-6's or D-7's being updated, leaving
  // the harness red for hours — board item 12928051839, fixed by Phase 42.
  check("taxonomy has 103 rows", TAXONOMY.length, 103);

  const REQUIRED = ["element_id", "sector", "pool", "authority", "status",
                    "s21_status", "s22_status", "rescue_route", "enclose_carveout",
                    "durability", "common_law_required"];
  REQUIRED.forEach(col =>
    check("column present: " + col, Object.keys(TAXONOMY[0]).indexOf(col) >= 0, true));

  /* D-1 / D-3 - the central invariant. A row is exempt from the common-law
     test if and only if it was rescued by s.23(2), follows the plant under
     s.25, or is excluded outright. Derived independently of the CSV's own
     common_law_required column, then compared to it. */
  const EXEMPT = ["s23_2_integral", "s23_2_other", "s25", "excluded"];
  let mismatches = [];
  TAXONOMY.forEach(r => {
    const clr = (r.common_law_required || "").trim().toUpperCase();
    if (clr === "NA") return;
    const expected = EXEMPT.indexOf(r.rescue_route) === -1;
    if ((clr === "TRUE") !== expected)
      mismatches.push(r.element_id + " route=" + r.rescue_route + " clr=" + clr);
  });
  check("D-1/D-3: common_law_required agrees with rescue_route on every row", mismatches, []);

  /* D-1 - every List C row needs the common-law test. This is the defect. */
  const listCNoTest = TAXONOMY.filter(r =>
    r.rescue_route.indexOf("list_c") === 0 &&
    (r.common_law_required || "").trim().toUpperCase() !== "TRUE").map(r => r.element_id);
  check("D-1: no List C row is treated as automatically qualifying", listCNoTest, []);

  /* D-3 - integral features are NOT common-law tested. */
  const ifTested = TAXONOMY.filter(r =>
    r.rescue_route === "s23_2_integral" &&
    (r.common_law_required || "").trim().toUpperCase() === "TRUE").map(r => r.element_id);
  check("D-3: no s.23(2) integral feature carries a common-law test", ifTested, []);

  /* D-2 - every row carries a pool. */
  const noPool = TAXONOMY.filter(r => !r.pool).map(r => r.element_id);
  check("D-2: every row carries a pool tag", noPool, []);
  const badPool = TAXONOMY.filter(r =>
    ["SR", "MP", "MP_AIA", "APPORTION", "SBA", "NONE", "FOLLOWS_PLANT"].indexOf(r.pool) === -1)
    .map(r => r.element_id + "=" + r.pool);
  check("D-2: no unrecognised pool value", badPool, []);

  /* D-4 - s.25 works follow the plant they serve, so they have no pool of
     their own and are never common-law tested. */
  const s25 = TAXONOMY.filter(r => r.category === "enabling_works");
  check("D-4: six s.25 rows exist (one shared plus one per sector)", s25.length, 6);
  check("D-4: every s.25 row is FOLLOWS_PLANT",
    s25.filter(r => r.pool !== "FOLLOWS_PLANT").map(r => r.element_id), []);
  check("D-4: every s.25 row has rescue_route s25",
    s25.filter(r => r.rescue_route !== "s25").map(r => r.element_id), []);
  check("D-4: every sector has an s.25 row",
    SECTORS.length && ["CH", "DEN", "SL", "GP", "PH"].filter(sec =>
      !s25.some(r => r.sector === sec)), []);

  /* D-6 - s.23(4) reaches List C items 1-16 only. */
  const badCarve = TAXONOMY.filter(r => {
    if (r.enclose_carveout !== "s23_4") return false;
    const m = /^list_c_(\d+)/.exec(r.rescue_route);
    return !m || +m[1] > 16;
  }).map(r => r.element_id + " route=" + r.rescue_route);
  check("D-6: s23_4 is only ever set on a List C item 1-16", badCarve, []);

  // Six, not five, since LS-DEN-015 (taxonomy defect F-8) joined the same
  // open_cta_q3 family as LS-GP-008 and LS-PH-002/003 on 29 Aug 2026.
  check("D-6: the six unresolved plenum-ceiling rows are exactly the expected ones",
    TAXONOMY.filter(r => r.enclose_carveout === "open_cta_q3").map(r => r.element_id).sort(),
    ["LS-CH-013", "LS-DEN-015", "LS-GP-008", "LS-PH-002", "LS-PH-003", "LS-SR-004"]);

  /* the s.28 thermal-insulation trap: it is NOT caught by either carve-out */
  check("D-6: thermal insulation (s.28 route) is not caught by the carve-out",
    (TAXONOMY.find(r => r.element_id === "LS-SR-007") || {}).enclose_carveout, "none");

  /* D-7 - durability sits inside the common-law test, so a row exempt from
     that test is never durability-tested. */
  const durBad = TAXONOMY.filter(r =>
    r.durability === "not_tested" &&
    (r.common_law_required || "").trim().toUpperCase() === "TRUE").map(r => r.element_id);
  check("D-7: no not_tested row also requires the common-law test", durBad, []);

  check("D-7: the review_short_cycle rows are exactly the chattel bundles",
    TAXONOMY.filter(r => r.durability === "review_short_cycle").map(r => r.element_id).sort(),
    // LS-CH-015 added 29 Aug 2026 by taxonomy defect B3 — Care Homes was the
    // one sector missing the loose-equipment chattel bundle.
    ["LS-CH-015", "LS-DEN-013", "LS-GP-013", "LS-PH-018", "LS-SL-012"]);
  check("D-7: every chattel row is flagged for the durability review",
    TAXONOMY.filter(r => r.category === "chattel" && r.durability !== "review_short_cycle")
      .map(r => r.element_id), []);
}

/* =============================================================================
   SUITE B - citation control (D-8)
   ============================================================================= */
if (startSuite("B", "Citation control — D-8")) {

  const files = ["Module-00-Master-Engine-Specification.md", "Module-01-Care-Homes-Specification.md",
                 "Module-02-Dental-Specification.md", "Module-03-Supported-Living-Specification.md",
                 "Module-04-GP-Primary-Care-Specification.md", "Module-05-Private-Hospitals-Clinics-Specification.md"];

  files.forEach(f => {
    const t = fs.readFileSync(path.join(MODULES_DIR, f), "utf8");   /* Phase 132g - the live copy */
    check(f + ": SSE Generation cited at the Supreme Court", t.indexOf("[2023] UKSC 17") >= 0, true);
    check(f + ": Urenco cited at the Court of Appeal", t.indexOf("[2022] EWCA Civ 1587") >= 0, true);
  });

  /* The mechanism by which an overturned decision gets quoted back into a
     claim is a paragraph number with no instance behind it — the UT and the
     CA number their paragraphs differently, and the UT was reversed.

     The rule is that the DOCUMENT must establish which instance, not that
     every mention repeats the full citation. So: any file that cites a
     Urenco paragraph number must somewhere carry the Court of Appeal
     citation. A second "*Urenco* at [97]" in a file that has already cited
     it in full is ordinary legal writing, not a defect. */
  const orphaned = [];
  [TAX, SITE].concat(files.map(f => path.join(MODULES_DIR, f))).forEach(p => {
    const t = fs.readFileSync(p, "utf8");
    const citesPara = /Urenco[^.\n]{0,30}\[\d{1,3}\]/.test(t.replace(/\[2022\] EWCA Civ 1587/g, ""));
    if (citesPara && t.indexOf("[2022] EWCA Civ 1587") === -1)
      orphaned.push(path.basename(p));
  });
  check("D-8: no file cites a Urenco paragraph without establishing the instance", orphaned, []);
}

/* =============================================================================
   SUITE C - the plant decision order (D-1, D-3, D-6, D-7)
   ============================================================================= */
if (startSuite("C", "Plant decision order — CB_PLANT")) {

  /* P3 before P4 - an integral feature never reaches the common-law test */
  check("D-3: s.23(2) integral feature qualifies regardless of function",
    CB_PLANT.resolveRescue({ rescue_route: "s23_2_integral" }).commonLaw, false);
  check("D-3: s.23(2) integral feature is special rate",
    CB_PLANT.resolveRescue({ rescue_route: "s23_2_integral" }).pool, "SR");

  /* P4 does not finish the analysis - the hydrotherapy pool case */
  check("D-1: List C item 16 still requires the common-law test",
    CB_PLANT.resolveRescue({ rescue_route: "list_c_16" }).commonLaw, true);
  check("D-1: List C route is LISTC→CL, not IF",
    CB_PLANT.resolveRescue({ rescue_route: "list_c_16" }).route, "LISTC→CL");

  check("D-4: s.25 works follow the plant and are not common-law tested",
    CB_PLANT.resolveRescue({ rescue_route: "s25" }).commonLaw, false);

  check("D-3: an open pool call is not resolved by the engine",
    CB_PLANT.resolveRescue({ rescue_route: "s23_2_integral_or_none" }).pool, "APPORTION");
  check("D-3: an open pool call acquires the common-law test it would not carry at SR",
    CB_PLANT.resolveRescue({ rescue_route: "s23_2_integral_or_none" }).commonLaw, true);

  /* D-1's conservative default */
  check("D-1: a List C row with no function finding does not qualify",
    CB_PLANT.rowQualifies({ route: "LISTC→CL" }), false);
  check("D-1: a List C row with a function finding qualifies",
    CB_PLANT.rowQualifies({ route: "LISTC→CL", function_finding: true }), true);
  check("D-1: an integral feature qualifies with no function finding",
    CB_PLANT.rowQualifies({ route: "IF" }), true);

  /* D-6 */
  check("D-6: the carve-out bites where trade purpose is not evidenced",
    CB_PLANT.encloseCarveOut({ enclose_carveout: "s23_4" }).applies, true);
  check("D-6: the carve-out lifts where trade purpose is evidenced",
    CB_PLANT.encloseCarveOut({ enclose_carveout: "s23_4", principal_purpose_trade: true }).applies, false);
  check("D-6: the plenum-ceiling conflict is surfaced, not resolved",
    CB_PLANT.encloseCarveOut({ enclose_carveout: "open_cta_q3" }).open, true);
  check("D-6: the carve-out is terminal even with a function finding",
    CB_PLANT.rowQualifies({ route: "LISTC→CL", enclose_carveout: "s23_4", function_finding: true }), false);
  check("D-6: an unanswered CTA question returns null, not false",
    CB_PLANT.rowQualifies({ route: "CL", enclose_carveout: "open_cta_q3" }), null);

  /* D-7 */
  check("D-7: a deemed-plant row is not durability tested",
    CB_PLANT.durabilityTest({ durability: "not_tested" }).tested, false);
  check("D-7: a chattel bundle is flagged, not decided",
    CB_PLANT.durabilityTest({ durability: "review_short_cycle" }).open, true);
  check("D-7: an explicit sub-two-year life fails",
    CB_PLANT.durabilityTest({ durability: "settled_over_two_years", expected_life_years: 1 }).passes, false);
  check("D-7: an explicit two-year life passes",
    CB_PLANT.durabilityTest({ durability: "settled_over_two_years", expected_life_years: 2 }).passes, true);
  check("D-7: a chattel bundle returns null from rowQualifies",
    CB_PLANT.rowQualifies({ route: "CL", durability: "review_short_cycle", function_finding: true }), null);
}

/* =============================================================================
   SUITE D - the pool model (D-2, D-4)
   ============================================================================= */
if (startSuite("D", "Pool model — CB_POOL and CB_S25")) {

  const un = CB_POOL.split({}, 100000, 200000, []);
  check("D-2: with no evidence the split is undetermined", un.determined, false);
  check("D-2: undetermined split returns null pool figures", un.main, [null, null]);
  check("D-2: undetermined split raises the flag that gates the timing layer",
    un.flagCode, "POOL_SPLIT_NOT_DETERMINED");
  check("D-2: no default special-rate ratio is asserted", un.special, [null, null]);

  const meas = CB_POOL.split({ sr_share_lo: 0.4, sr_share_hi: 0.4 }, 100000, 200000, []);
  check("D-2: a measured share is used", meas.determined, true);
  check("D-2: special rate at the measured share", meas.special, [40000, 80000]);
  /* conservative pairing: main_lo against special_hi and vice versa */
  check("D-2: main pool paired conservatively (lo vs special hi)", meas.main[0], 20000);
  check("D-2: main pool paired conservatively (hi vs special lo)", meas.main[1], 160000);

  check("D-2/C-8: an undetermined split makes an election unsafe under CA26850",
    CB_POOL.electionSplitSafe(un), false);
  check("D-2/C-8: a measured split makes it safe", CB_POOL.electionSplitSafe(meas), true);

  /* D-4 */
  check("D-4: s.25 works take the pool of the plant they serve",
    CB_S25.poolOf({ pool: "SR" }), "SR");
  check("D-4: an unresolved parent pool stays unresolved on the works",
    CB_S25.poolOf({ pool: "APPORTION" }), "APPORTION");
  check("D-4: an s.25 line with no named parent is not claimable (Urenco [97])",
    CB_S25.claimable({ amount: 50000 }), false);
  check("D-4: an s.25 line with a named parent is claimable",
    CB_S25.claimable({ amount: 50000, parent_element_id: "LS-SR-001" }), true);
  check("D-4: the s.185(3) “+ I” limb is exposed",
    CB_S25.additionToCap({ s25_alterations_expenditure: 40000 }), 40000);
  check("D-4: FOLLOWS_PLANT rows resolve through the parent",
    CB_POOL.poolOfRow({ pool: "FOLLOWS_PLANT" }, { pool: "SR" }), "SR");
}

/* =============================================================================
   SUITE E - the election engine (C-1, C-2, C-3, C-5, C-6, C-7, C-8)
   ============================================================================= */
if (startSuite("E", "Election engine — CB_ELECTION")) {

  const SIX = ["amount", "plant", "land", "interest", "utrs", "both"];
  const good = {
    election_document: "held", election_content: SIX, election_value: 400000,
    acquisition_date: "2026-01-01", election_notified_date: "2026-02-01",
    transaction_type: "sale", election_multi_property: "no",
    election_scope: "all_fixtures", base_amount: 2000000
  };
  const w = extra => Object.assign({}, good, extra || {});

  /* --- C-1: the document and the six content requirements --- */
  check("C-1: a held but untested election is INDET, not CAP-ELECT and not LIVE",
    CB_ELECTION.assess(w({ election_content: undefined })).outcome, "INDET");
  check("C-1: an asserted election with no document is INDET, not CAP-ELECT",
    CB_ELECTION.assess(w({ election_document: "exists_not_held" })).outcome, "INDET");
  check("C-1: no election at all is NONE",
    CB_ELECTION.assess({ election_document: "no" }).outcome, "NONE");
  check("C-1: a complete, timely election caps",
    CB_ELECTION.assess(good).outcome, "CAP-ELECT");

  CB_ELECTION.CONTENT.forEach(req => {
    const without = SIX.filter(k => k !== req.key);
    const r = CB_ELECTION.assess(w({ election_content: without }));
    check("C-1: missing " + req.prov + " is not CAP-ELECT", r.outcome !== "CAP-ELECT", true);
    check("C-1: missing " + req.prov + " is named in the failure",
      r.missing.some(m => m.prov === req.prov), true);
  });

  /* --- C-2: s.201(1), notification not signature --- */
  check("C-2: no acquisition date means the limit cannot be tested",
    CB_ELECTION.notifiedInTime({ election_notified_date: "2020-01-01" }), null);
  check("C-2: notified inside two years",
    CB_ELECTION.notifiedInTime({ acquisition_date: "2020-01-01", election_notified_date: "2021-06-01" }), true);
  check("C-2: notified outside two years",
    CB_ELECTION.notifiedInTime({ acquisition_date: "2020-01-01", election_notified_date: "2023-06-01" }), false);
  check("C-2: s.201(1A) tribunal application inside the period switches the limit off",
    CB_ELECTION.notifiedInTime({ acquisition_date: "2020-01-01", election_notified_date: "2023-06-01",
      tribunal_application_date: "2021-02-01", tribunal_status: "undetermined" }), true);
  check("C-2: a LATER tribunal application does not revive an out-of-time election",
    CB_ELECTION.notifiedInTime({ acquisition_date: "2020-01-01", election_notified_date: "2023-06-01",
      tribunal_application_date: "2023-05-01", tribunal_status: "undetermined" }), false);
  check("C-2: a perfectly drafted but late election is NIL",
    CB_ELECTION.assess(w({ acquisition_date: "2020-01-01", election_notified_date: "2023-06-01" })).outcome, "NIL");

  /* --- C-3: the s.196 Table item, not freehold-vs-lease --- */
  check("C-3: sale of the interest is s.198 (Table item 1)",
    CB_ELECTION.section({ transaction_type: "sale" }).section, "s.198");
  check("C-3: a LEASE premium with no s.183 election is s.198 (Table item 9)",
    CB_ELECTION.section({ transaction_type: "lease_premium", s183_election_made: "no" }).section, "s.198");
  check("C-3: that is Table item 9",
    CB_ELECTION.section({ transaction_type: "lease_premium", s183_election_made: "no" }).item, 9);
  check("C-3: a lease premium WITH a joint s.183 election is s.199 (Table item 5)",
    CB_ELECTION.section({ transaction_type: "lease_premium", s183_election_made: "yes" }).section, "s.199");
  check("C-3: an unknown s.183 position is not guessed",
    CB_ELECTION.section({ transaction_type: "lease_premium" }).section, null);
  check("C-3: a below-value transfer has no election available",
    CB_ELECTION.section({ transaction_type: "below_market" }).available, false);
  check("C-3: a below-value transfer is NONE, and the document does not cap",
    CB_ELECTION.assess(w({ transaction_type: "below_market" })).outcome, "NONE");
  check("C-3: row E-B9, wrong section inside the window is LIVE",
    CB_ELECTION.assess(w({ transaction_type: "lease_premium", s183_election_made: "no",
      election_section: "s.199" })).outcome, "LIVE");
  check("C-3: the correct section on the same facts still caps",
    CB_ELECTION.assess(w({ transaction_type: "lease_premium", s183_election_made: "no",
      election_section: "s.198" })).outcome, "CAP-ELECT");
  check("C-3: a document silent on the section is not treated as wrong-section",
    CB_ELECTION.assess(w({ election_section: "unstated" })).outcome, "CAP-ELECT");

  /* --- C-5: nominal elections --- */
  check("C-5: £1 on a £2m purchase is nominal",
    CB_ELECTION.isNominal({ election_value: 1, base_amount: 2000000 }), true);
  check("C-5: £1,000 is nominal on any deal size",
    CB_ELECTION.isNominal({ election_value: 1000, base_amount: 2000000 }), true);
  check("C-5: 0.25% of the price is nominal",
    CB_ELECTION.isNominal({ election_value: 5000, base_amount: 2000000 }), true);
  check("C-5: 2.5% of the price is not",
    CB_ELECTION.isNominal({ election_value: 50000, base_amount: 2000000 }), false);
  check("C-5: with no price the fraction test cannot run and does not fire",
    CB_ELECTION.isNominal({ election_value: 5000 }), false);
  check("C-5: a nominal election is NOMINAL, not CAP-ELECT",
    CB_ELECTION.assess(w({ election_value: 1 })).outcome, "NOMINAL");
  check("C-5: it carries a reasoned negative, not a small figure",
    !!CB_ELECTION.assess(w({ election_value: 1 })).terminal, true);
  check("C-5: a nominal election is not nil — £1 of expenditure is £1",
    CB_ELECTION.applyCap(CB_ELECTION.assess(w({ election_value: 1 })), 600000, 900000, []), [1, 1]);

  /* --- C-6: element-by-element scoping --- */
  check("C-6: an election listing items does not extinguish the rest",
    CB_ELECTION.applyCap(
      CB_ELECTION.assess(w({ election_value: 1, election_scope: "listed_items" })),
      600000, 900000, []), [1, 900000]);
  check("C-6: a scoped election floors at the elected figure",
    CB_ELECTION.applyCap(
      CB_ELECTION.assess(w({ election_scope: "listed_items" })),
      600000, 900000, []), [400000, 900000]);
  check("C-6: a general election caps across the range",
    CB_ELECTION.applyCap(CB_ELECTION.assess(w({})), 600000, 900000, []), [400000, 400000]);
  check("C-6: unclear scope is conservative",
    CB_ELECTION.applyCap(CB_ELECTION.assess(w({ election_scope: "unclear" })), 600000, 900000, []),
    [400000, 400000]);
  check("C-6: the C-5 reasoned negative does NOT fire on a scoped nominal election",
    CB_ELECTION.nominalIsTerminal({ election_value: 1, base_amount: 2000000, election_scope: "listed_items" }), false);
  check("C-6: it does fire on a general nominal election",
    CB_ELECTION.nominalIsTerminal({ election_value: 1, base_amount: 2000000, election_scope: "all_fixtures" }), true);
  check("C-6: row E-B11, a portfolio-wide election is a validity defect",
    CB_ELECTION.assess(w({ election_multi_property: "yes" })).outcome, "LIVE");

  /* --- C-7: the s.203 duty --- */
  check("C-7: no election means no notification",
    CB_ELECTION.s203Position({}, CB_ELECTION.assess({ election_document: "no" })).position,
    "no_election_identified");
  check("C-7: an election with a closed return raises the duty",
    CB_ELECTION.s203Position(good, CB_ELECTION.assess(good)).position,
    "notification_may_be_required");
  check("C-7: an open return is corrected by amendment instead",
    CB_ELECTION.s203Position(w({ return_in_time: true }), CB_ELECTION.assess(good)).position,
    "return_being_amended");
  check("C-7: a s.200(4) reduction raises the duty even on an open return",
    CB_ELECTION.s203Position(w({ return_in_time: true, later_election_in_chain: "yes" }),
      CB_ELECTION.assess(good)).position, "notification_may_be_required");
  check("C-7: the engine does not assert that a notification IS due",
    CB_ELECTION.s203Position(good, CB_ELECTION.assess(good)).required, null);

  /* --- C-8: the pool split from the election --- */
  const split = CB_ELECTION.rateSplit(w({ election_rate_split: "split", election_value_sr: 150000 }));
  check("C-8: a stated split is safe under CA26850", split.safe, true);
  check("C-8: the special-rate share is derived from the document", split.sr, 0.375);
  check("C-8: the main-rate leg is the remainder", split.main, 250000);
  check("C-8: a single undifferentiated figure is not safe",
    CB_ELECTION.rateSplit(w({ election_rate_split: "single_figure" })).safe, false);
  check("C-8: “cannot tell” is not evidence of a defect",
    CB_ELECTION.rateSplit(w({})).safe, null);

  const sSplit = w({ election_rate_split: "split", election_value_sr: 150000 });
  CB_ELECTION.assess(sSplit);
  check("C-8: a split election feeds the pool model at the measured basis",
    sSplit.pool_split_basis, "measured");
  check("C-8: and produces real pool figures",
    CB_POOL.split(sSplit, 400000, 400000, []).special, [150000, 150000]);

  const sScoped = w({ election_rate_split: "split", election_value_sr: 150000, election_scope: "listed_items" });
  CB_ELECTION.assess(sScoped);
  check("C-8: a SCOPED election's split is not applied to the whole property",
    sScoped.pool_split_basis, undefined);

  const single = CB_ELECTION.assess(w({ election_rate_split: "single_figure" }));
  check("C-8: row E-B10 does not defeat the FVR — the claim still caps",
    single.outcome, "CAP-ELECT");
  check("C-8: but the split is marked unsafe", single.splitRisk, true);
  check("C-8: and the re-election action is named", typeof single.splitAction, "string");
}

/* =============================================================================
   SUITE F - the rate table (LEG-E1)
   ============================================================================= */
if (startSuite("F", "Rate table — LEG-E1 and Rulebook I")) {

  check("LEG-E1: exactly one rate table exists in the source",
    (src.match(/const MARGINAL_RATE = \{ company:/g) || []).length, 0);
  /* The old dates still appear once, inside the CB_RATES comment that records
     the drift. What matters is that no LITERAL assigns a basis date any more —
     every reference now resolves through CB_RATES.BASIS. */
  check("LEG-E1: no basis date is assigned as a literal",
    (src.match(/RATE_BASIS\s*=\s*"/g) || []).length, 0);
  check("LEG-E1: every module reads the basis from CB_RATES",
    (src.match(/const RATE_BASIS\s*=\s*CB_RATES\.BASIS/g) || []).length, 5);
  check("LEG-E1: the basis date is Rulebook I's verification date",
    CB_RATES.BASIS, "24 August 2026");

  /* finding I-11 - the figure the drifted copies most often got wrong */
  check("I-11: the company marginal range tops at 26.5%, not 25%",
    CB_RATES.rangeFor("company"), [0.19, 0.265]);
  check("I-12: the income-tax range is 20-45%", CB_RATES.rangeFor("uninc_ruk"), [0.20, 0.45]);

  /* finding I-1 and I-3 - the WDA is a function, not a constant */
  check("I-1: main pool WDA from April 2026 is 14%", CB_RATES.WDA.main_from_2026, 0.14);
  check("I-2: the special rate pool was not changed by FA 2026", CB_RATES.WDA.special, 0.06);
  check("I-3: CA23222 hybrid reproduces HMRC's worked example (1 Jan-31 Dec 2026 = 14.99%)",
    CB_RATES.hybridMainRate("2026-01-01", "2026-12-31", true), 0.1499);
  check("I-3: a period wholly after the change is 14%",
    CB_RATES.hybridMainRate("2026-05-01", "2027-04-30", true), 0.14);
  check("I-3: a period wholly before the change is 18%",
    CB_RATES.hybridMainRate("2024-01-01", "2024-12-31", true), 0.18);
  check("I-3: the IT change date is six days later than the CT one",
    CB_RATES.CHANGE_DATE.it, "2026-04-06");

  /* Scotland — the Rulebook I addendum, board item 12889350666.
     Verified 25 Aug 2026 against gov.uk and gov.scot. */
  check("Scotland: nothing is left marked unverified",
    Object.keys(CB_RATES.UNVERIFIED).length, 0);
  check("Scotland: the floor is the STARTER rate 19%, not the intermediate 21%",
    CB_RATES.rangeFor("uninc_scot")[0], 0.19);
  check("Scotland: the current top rate is 48%",
    CB_RATES.rangeFor("uninc_scot")[1], 0.48);

  /* rule 7.2 — an amended earlier year is valued at THAT year's rate */
  check("Rule 7.2: 2023-24 topped at 47%, not 48%",
    CB_RATES.rangeForYear("uninc_scot", "2023-24"), [0.19, 0.47]);
  check("Rule 7.2: 2022-23 topped at 46%",
    CB_RATES.rangeForYear("uninc_scot", "2022-23"), [0.19, 0.46]);
  check("Rule 7.2: an unlisted year falls back to the current table",
    CB_RATES.rangeForYear("uninc_scot", "2019-20"), [0.19, 0.48]);
  check("Rule 7.2: rUK is unaffected by the Scottish year table",
    CB_RATES.rangeForYear("uninc_ruk", "2022-23"), [0.20, 0.45]);

  /* the Advanced rate arrived in 2024-25 — the band COUNT changes */
  check("Scotland: six bands from 2024-25",
    CB_RATES.SCOTLAND_BY_YEAR["2024-25"].bands.length, 6);
  check("Scotland: five bands in 2023-24 (no Advanced rate)",
    CB_RATES.SCOTLAND_BY_YEAR["2023-24"].bands.length, 5);

  /* the taper band — same method Rulebook I uses for rUK's 60% */
  check("Scotland: the effective taper rate is 67.5%, the UK's highest",
    CB_RATES.taperBandRate("2026-27"), 0.675);
  check("Scotland: it was 63.0% in 2023-24", CB_RATES.taperBandRate("2023-24"), 0.63);
  check("Scotland: it was 61.5% in 2022-23", CB_RATES.taperBandRate("2022-23"), 0.615);

  let scotFlags = [];
  const scotText = CB_RATES.describe("uninc_scot", f => scotFlags.push(f));
  check("Scotland: a Scottish claim still raises a band-confirmation flag", scotFlags.length, 1);
  check("Scotland: the 67.5% band is disclosed in the client copy",
    scotText.indexOf("67.5%") >= 0, true);
  let rukFlags = [];
  CB_RATES.describe("uninc_ruk", f => rukFlags.push(f));
  check("LEG-E1: the rUK description raises no flag", rukFlags.length, 0);
  check("I-Q2: the 60% band is disclosed in the copy rather than modelled",
    CB_RATES.describe("uninc_ruk").indexOf("60%") >= 0, true);
}

/* =============================================================================
   SUITE G - Rulebook B truth table, against the LIVE sector engines
   ============================================================================= */
if (startSuite("G", "Rulebook B truth table — live engines")) {

  if (liftError) {
    check("engines lift out of the source", String(liftError), "no error");
  } else {

    SECTORS.forEach(s =>
      check("engine lifted: " + s, typeof ENGINES[s].runEngine, "function"));

    /* a minimal care-home state; each row overrides what it is testing */
    function state(extra) {
      return Object.assign({
        sector: "care_homes", trigger: ["purchase"], deal: "property",
        base_amount: 2000000, claimant_type: "company", activity: "trade",
        dwelling_setting: "institution_commercial", acuity: "normal",
        flags: [], assumptions: [], lrr: false, return_in_time: false
      }, extra || {});
    }
    function run(sector, extra) {
      const s = state(extra);
      const r = ENGINES[sector].runEngine(s);
      return { r: r, s: s, QE: r.QE, flags: s.flags, outcome: r.outcome };
    }

    /* ---- rows the SHARED LAYER decides. These are Phase 2's work. ---- */
    const SIX = ["amount", "plant", "land", "interest", "utrs", "both"];
    const el = extra => CB_ELECTION.assess(Object.assign({
      election_document: "held", election_content: SIX, election_value: 400000,
      acquisition_date: "2026-01-01", election_notified_date: "2026-02-01",
      transaction_type: "sale", election_multi_property: "no",
      election_scope: "all_fixtures", base_amount: 2000000
    }, extra)).outcome;

    check("C2  — pooled, valid election, value known → CAP-ELECT", el({}), "CAP-ELECT");
    check("C2a — election held, validity NOT TESTED → INDET (not LIVE)",
      el({ election_content: undefined }), "INDET");
    check("C2a — “not looked at yet” is not the same as “defective”",
      el({ election_content: undefined }) !== el({ election_content: [] }), true);
    check("C2b — election TESTED and empty, window open → LIVE",
      el({ election_content: [] }), "LIVE");
    check("C2b — election invalid, window open → LIVE",
      el({ election_content: SIX.filter(k => k !== "both") }), "LIVE");
    check("C2c — election invalid, window closed → NIL",
      el({ election_content: SIX.filter(k => k !== "both"),
           acquisition_date: "2015-01-01", election_notified_date: "2015-06-01" }), "NIL");
    check("C2d — election valid at a nominal value → NOMINAL",
      el({ election_value: 1 }), "NOMINAL");
    check("C3  — election asserted, document not held → INDET",
      el({ election_document: "exists_not_held" }), "INDET");
    check("C5  — no election, window closed, no tribunal → NIL is reachable",
      CB_ELECTION.windowOpen({ acquisition_date: "2015-01-01" }), false);
    check("C6  — tribunal application in time, undetermined → window stays open",
      CB_ELECTION.windowOpen({ acquisition_date: "2015-01-01",
        tribunal_application_date: "2015-06-01", tribunal_status: "undetermined" }), true);
    check("E4  — the clock runs from the grant of a lease, not a purchase",
      CB_ELECTION.electionDeadline({ grant_date: "2026-01-01" }) !== null, true);

    /* ---- rows the SECTOR ENGINE decides. Module B, not Phase 2's scope. ---- */

    /* A1 - no past owner ever entitled -> unrestricted apportionment */
    const a1 = run("care_homes", { prior_owner_entitled: "no", prior_owner_claimed: "no" });
    check("A1  — no past owner entitled → not capped to nil", a1.QE[0] > 0, true);

    /* E1 - new build on own cost */
    const e1 = run("care_homes", { trigger: ["new_build"], deal: "property" });
    check("E1  — new build produces a figure on own cost", e1.QE[1] > 0, true);
    check("E1  — new build is not election-capped", e1.s.election_outcome, undefined);

    /* E2 - refurbishment of a property already owned */
    const e2 = run("care_homes", { trigger: ["refurb_fitout"], deal: "property" });
    check("E2  — refurbishment produces a figure", e2.QE[1] > 0, true);

    /* C3 through the live engine - an asserted election no longer caps */
    const c3 = run("care_homes", {
      prior_owner_claimed: "yes", prior_owner_entitled: "yes",
      election_document: "exists_not_held", election_value: 50000
    });
    check("C-1 live: an asserted election with a typed figure no longer caps at it",
      c3.QE[1] > 50000, true);
    check("C-1 live: and the floor drops to nil pending the document", c3.QE[0], 0);

    /* CAP-ELECT through the live engine */
    const capped = run("care_homes", {
      prior_owner_claimed: "yes", prior_owner_entitled: "yes",
      election_document: "held", election_content: SIX, election_value: 300000,
      acquisition_date: "2026-01-01", election_notified_date: "2026-02-01",
      transaction_type: "sale", election_multi_property: "no", election_scope: "all_fixtures"
    });
    check("C2 live: a valid election caps the range at its figure", capped.QE, [300000, 300000]);

    /* D-2 live: the pool split reaches the result object */
    check("D-2 live: every result carries a pool split", typeof capped.r.pool, "object");
    check("D-2 live: undetermined where no M&E breakdown was supplied",
      capped.r.pool.determined, false);

    /* C-7 live */
    check("C-7 live: the s.203 position is established on every election result",
      capped.s.s203.position, "notification_may_be_required");

    /* ---- xfail: defects logged on the board, outside Phase 2 ---- */

    /* C1 - the inverted s.187A pooling branch (R-B1). A seller who was
       entitled and never pooled is NIL. The engine returned its best case.
       FIXED BY PHASE 154a1 (line 13), 4 October 2026, AND NO LONGER AN XFAIL.
       Rulebook B row C1 is a pooling requirement IN FORCE, which needs the
       seller to have stopped owning after April 2014 (FA 2012 Sch 10 para
       13(2)); so C1 now carries a 2019 sale date and is NIL. The same seller
       with NO date is unresolved with nil at the bottom (C1u): the date could
       take the requirement out of force (branch D), so it is never a firm nil
       and never the full range. Every flow, not only care homes. */
    const lo = q => Array.isArray(q) ? q[0] : q;
    const hi = q => Array.isArray(q) ? q[1] : q;
    const POOL_FLAG = /s\.187A\(4\) POOLING/;
    const c1 = run("care_homes", { prior_owner_entitled: "yes", prior_owner_claimed: "no", past_owner_cessation_date: "2019-06-01" });
    check("C1  — entitled seller who never pooled → NIL",
      c1.QE, [0, 0]);
    check("C1  — and the flag names the pooling requirement, and says what would meet it",
      [c1.flags.some(f => /s\.187A\(4\) POOLING REQUIREMENT NOT MET/.test(f)),
       c1.flags.some(f => /tax period that began on or before the day it sold/.test(f))], [true, true]);
    SECTORS.forEach(sec => {
      const n = run(sec, { prior_owner_entitled: "yes", prior_owner_claimed: "no", past_owner_cessation_date: "2019-06-01" });
      check("C1  " + sec + " — entitled seller who never pooled, sold in 2019 → nil",
        [lo(n.QE), hi(n.QE), n.flags.some(f => POOL_FLAG.test(f))], [0, 0, true]);
      const u = run(sec, { prior_owner_entitled: "yes", prior_owner_claimed: "no" });
      check("C1u " + sec + " — the same seller, sale date not known → unresolved: flagged, never the full range with nothing said",
        [sec === "supported_living" || lo(u.QE) === 0, hi(u.QE) > 0, u.flags.some(f => /s\.187A\(4\) POOLING POSITION UNPROVEN/.test(f))],
        [true, true, true]);
      const d = run(sec, { prior_owner_entitled: "yes", prior_owner_claimed: "no", past_owner_cessation_date: "2013-06-01" });
      check("C1d " + sec + " — sold before April 2014 → the pooling requirement is not in force (branch D): no pooling flag, a figure",
        [hi(d.QE) > 0, d.flags.some(f => POOL_FLAG.test(f))], [true, false]);
    });
    /* N4 - an unknown claim history never relieves, and "not sure" and absent
       behave alike: both unresolved with nil at the bottom (Rulebook B row C9). */
    const cs = run("care_homes", { prior_owner_entitled: "yes", prior_owner_claimed: "unsure", past_owner_cessation_date: "2019-06-01" });
    const ca = run("care_homes", { prior_owner_entitled: "yes", past_owner_cessation_date: "2019-06-01" });
    check("C9  — an entitled seller whose claim history is 'not sure': nil at the bottom, flagged",
      [cs.QE[0], cs.QE[1] > 0, cs.flags.some(f => POOL_FLAG.test(f))], [0, true, true]);
    check("C9  — never asked behaves exactly as 'not sure' (N4: absent and unsure alike)",
      [ca.QE[0], ca.QE[1], ca.flags.some(f => POOL_FLAG.test(f))], [cs.QE[0], cs.QE[1], true]);
    /* What the pooling requirement must NOT touch. */
    const cy = run("care_homes", { prior_owner_entitled: "yes", prior_owner_claimed: "yes", past_owner_cessation_date: "2019-06-01" });
    check("C1y — a seller who claimed (and so pooled) is not met by the pooling check",
      [cy.flags.some(f => POOL_FLAG.test(f)), (cy.s.s187a || {}).requirement === "POOLING"], [false, false]);
    const cn = run("care_homes", { prior_owner_entitled: "no", prior_owner_claimed: "no", past_owner_cessation_date: "2019-06-01" });
    check("C1n — a seller who could never claim is not met by it either: still the best case",
      [cn.QE[0] > 0, cn.flags.some(f => POOL_FLAG.test(f))], [true, false]);
    const cq = run("care_homes", { prior_owner_entitled: "unsure", prior_owner_claimed: "no", past_owner_cessation_date: "2019-06-01" });
    check("C1q — an entitlement not known is unchanged by this check (only a seller KNOWN to have been able to claim)",
      cq.flags.some(f => POOL_FLAG.test(f)), false);
    const cr = run("care_homes", { trigger: ["refurbishment"], prior_owner_entitled: "yes", prior_owner_claimed: "no", past_owner_cessation_date: "2019-06-01" });
    check("C1r — not a purchase, so no past owner's pooling is asked about",
      cr.flags.some(f => POOL_FLAG.test(f)), false);

    /* B2/B3 - the look-back to the last entitled owner. Rulebook B called this
       the most serious undetected defect: a non-entitled intermediary does not
       reset the position. Fixed by board item 12829984165 (Phase 4b, 25 Aug
       2026): the engine now looks past a non-entitled seller and caps at the
       earlier entitled owner's disposal value instead of treating it as an
       automatic best case. */
    const b2 = run("care_homes", {
      prior_owner_entitled: "no", prior_owner_claimed: "no",
      earlier_entitled_owner: "yes", earlier_disposal_value: 120000
    });
    check("B2  — non-entitled seller but an earlier entitled owner → CAP-DV at the earlier figure",
      b2.QE[1], 120000);

    /* C5 - the two-year FVR window. Fixed by board item 12829983662 (Phase 4b,
       25 Aug 2026): a dedicated s.187A(7) question now sits in every sector's
       flow, reachable independently of whether an election document exists. */
    check("C5  — the flow asks whether the FVR window has closed",
      (ENGINES.care_homes.Q || []).some(q => /window|two years|2 years/i.test(q.ask || "")),
      true);
  }
}


/* PHASE 113i — HOISTED FROM SUITE H, UNCHANGED. It was declared inside that
   suite's block, and under "use strict" a block-level function is invisible
   outside it. Suite V needs to force one switch too; one definition used by
   both is safer than a copy that can quietly drift from the original. */
/* Lift a sector engine with named CB_CTA gates forced on. Where CB_CTA is
   not in the source - which is the position today - the rewrite matches
   nothing and the engine is lifted exactly as it ships. */
function liftGated(sector, gates) {
  const marker = "/* ===== " + sector + " ===== */";
  const start = engineBody.indexOf(marker);
  const open = engineBody.indexOf("(function(){", start);
  const reg = engineBody.indexOf('RS["' + sector + '"]=', open);
  const close = engineBody.indexOf("})();", reg);
  let body = engineBody.slice(open + "(function(){".length, close);
  /* PHASE 102 - the package holds only the engine half of the sector module
     (everything above its RENDERER banner) plus a four-line shim standing in
     for the renderer bindings `reset()` names. Take both from the package
     file so this suite tries the package's own text, not a copy of it. */
  if (USE_PACKAGE) {
    body = pkgFenced("sector-" + sector + ".js", PKG_SHIM) + "\n" +
           pkgFenced("sector-" + sector + ".js", PKG_SLICE);
  }
  let layer = layerSrc;
  (gates || []).forEach(g => {
    const re = new RegExp("(" + g + "\\s*:\\s*)false", "g");
    layer = layer.replace(re, "$1true");
  });
  const wrapped =
    "var document = __doc, window = __win, RS = {}, SECTORS = {};\n" + layer + "\n" +
    "return (function(){\n" + body +
    "\n return { runEngine: (typeof runEngine==='function') ? runEngine : null," +
    "          Q: (typeof Q!=='undefined') ? Q : null," +
    /* Phase 132h - suite AE needs the flow's hidden-question helper and pushFlag */
    "          hide: (typeof answerHiddenTakesBack==='function') ? answerHiddenTakesBack : null," +
    "          pushFlag: (typeof pushFlag==='function') ? pushFlag : null };\n})();";
  const doc = domStub();
  return new Function("__doc", "__win", wrapped)(doc, { addEventListener() {}, location: { href: "" } });
}


/* =============================================================================
   SUITE H - PHASES 8 AND 51. Prepared patches, gated on the chartered tax
   adviser and SHIPPED BEHIND SWITCHES.

   TWELVE engine changes wait on one specific open question each. Phase 51
   changed the model: instead of holding the patches outside the source until
   an answer arrives, all of them are now BUILT INTO caprebate-site.html behind
   named switches in CB_CTA, every switch defaulting to CURRENT BEHAVIOUR.
   Answering a question is now a one-line configuration change.

   It was TEN until 7 September 2026, when Phase 96 added the eleventh -
   transaction_tax_in_base, board item 12975610449, asserted as H13 below -
   and ELEVEN until 10 September 2026, when Phase 113j added the twelfth -
   grant_after_ceilings, board item 13014647417, asserted as H14 below - and
   TWELVE until 12 September 2026, when Phase 129 added five, asserted as H15
   to H19, and tied two client-facing sentences to switches, H20 and H21 - and
   SEVENTEEN until 13 September 2026, when Phase 129a added
   lease_premium_not_item9, board item 13033203928, asserted as H23 below:
   item 9 of the s.196 Table is a discontinuance followed by a sale, not a
   lease premium.
   THREE OF THOSE FIVE ARE A DIFFERENT KIND: the flats (H16), the shared lounge
   (H17) and the purchase clock (H18) had already shipped behind no switch, so
   their branch B is today's LIVE behaviour and branch A is the other reading.

   The answer may still be a third answer that neither branch anticipated - in
   which case the branch is rewritten, not flipped on.

   WHICH WAY EACH SWITCH MOVES MONEY IS ON ITS OWN "ON =>" LINE IN CB_CTA, AND
   THOSE LINES ARE THE COUNT. Until 13 September 2026 this paragraph said nine
   of the twelve make claims bigger, which stopped being true when Phase 129
   added five, so it now names the exceptions instead of carrying a number.
   Read off the ON => lines that day (Phase 129a): every switch not named here
   makes a claim BIGGER; trade_not_s35 (H4) makes it bigger on a different
   basis; s187a_needs_entitled_owner (H5) removes false negatives;
   grant_after_ceilings (H14) and self_contained_flats_stop (H16) can only make
   a claim SMALLER; and scottish_rate_from_main_home (H19) and
   lease_premium_not_item9 (H23) move it EITHER WAY. The claim-increasing ones
   are exactly why none of them may default to on, and why branch B below
   matters more than branch A. The ones that can only make a claim smaller
   need branch B just as much, for the opposite reason: it is what shows that
   today's more favourable reading, which nobody has confirmed, has not
   quietly moved.

   HOW THIS SUITE IS BUILT, AND WHY

     Each item gets two assertions.

     BRANCH A  - what the engine returns with the item's CB_CTA switch FORCED
                 ON. Since Phase 51 the switch exists, the force is real, and
                 these are ORDINARY ASSERTIONS. They were xfail up to 31 Aug
                 2026, when the branch was built; the xfail count fell from 14
                 to 4 as they were converted.

     BRANCH B  - what the engine returns with NO switch forced, which for
                 every one of the ten is "no change from before Phase 51".
                 THIS IS THE IMPORTANT HALF. It is the proof that nothing was
                 turned on by accident, and it must go on passing until a tax
                 adviser has actually answered the question. If you flip a
                 switch in CB_CTA, the matching branch-B assertion here will
                 fail - and that failure is this harness telling you a tax
                 position has been taken. Answer it by updating this suite
                 deliberately, never by muting it.

   Board 18422317809. Plan doc 46256300.
   ============================================================================= */
if (startSuite("H", "Phase 8 — prepared patches, gated on the CTA")) {

  if (liftError) {
    check("engines lift out of the source", String(liftError), "no error");
  } else {

    /* The shared layer on its own, with the named switches forced on. A-2 and
       A-3 live inside CB_S187A rather than in a sector body, so they are
       asserted against the module directly. */
    function layerGated(gates) {
      let layer = layerSrc;
      (gates || []).forEach(g => {
        layer = layer.replace(new RegExp("(" + g + "\\s*:\\s*)false", "g"), "$1true");
      });
      return new Function(layer + "; return {CB_S187A:CB_S187A, CB_CTA:CB_CTA, CB_ACQ:CB_ACQ, CB_CASH:CB_CASH, CB_TAXPOS:CB_TAXPOS, CB_RATES:CB_RATES, CB_S25:CB_S25, CB_JURIS:CB_JURIS, CB_ELECTION:CB_ELECTION};")();
    }

    const SIX = ["amount", "plant", "land", "interest", "utrs", "both"];

    function base(extra) {
      return Object.assign({
        sector: "care_homes", trigger: ["purchase"], deal: "property",
        base_amount: 2000000, claimant_type: "company", activity: "trade",
        dwelling_setting: "institution_commercial", acuity: "normal",
        flags: [], assumptions: [], lrr: false, return_in_time: false
      }, extra || {});
    }
    /* run against the engine as it ships */
    function run(sector, extra) {
      const s = base(extra); const r = ENGINES[sector].runEngine(s); return { r, s };
    }
    /* run against the engine with the named gates forced on */
    function runGated(sector, gates, extra) {
      const s = base(extra); const r = liftGated(sector, gates).runEngine(s); return { r, s };
    }
    /* PHASE 113f — ALL FIVE ENGINES NOW RETURN A RANGE, so these two index it
       directly. They used to carry an `Array.isArray` branch, because the
       supported-living flow returned a bare number and `r.QE[1]` was undefined
       there: a defect this file WORKED AROUND rather than reported. The site now
       returns [QE,QE] for that sector — the same point, honestly shaped — and
       Suite U asserts the shape across all five so no reader has to guess again.
       Indexing without the branch is deliberate: if a flow ever goes scalar
       again these go undefined and every H13 assertion below fails loudly. */
    const hi = r => r.QE[1];
    const lo = r => r.QE[0];
    const near = (a, b) => Math.abs(a - b) < 0.5;

    /* ---------------------------------------------------------------------
       H1 - C-4 (item 12840979279), gated on C-Q6.
       s.185(3) "+ I": the buyer's own s.25 building-alteration expenditure
       sits ON TOP of an elected figure, not inside it.
       Money: UNDERSTATES claims.
       --------------------------------------------------------------------- */
    const H1_ELECTION = {
      prior_owner_claimed: "yes", prior_owner_entitled: "yes",
      election_document: "held", election_content: SIX, election_value: 300000,
      acquisition_date: "2026-01-01", election_notified_date: "2026-02-01",
      transaction_type: "sale", election_multi_property: "no", election_scope: "all_fixtures",
      s25_alterations_expenditure: 40000
    };
    check("H1 branch B — an election caps at its own figure and the buyer's s.25 spend stays inside it",
      run("care_homes", H1_ELECTION).r.QE, [300000, 300000]);
    check("H1 branch A — s.185(3) adds the buyer's own s.25 spend to the ceiling (300k + 40k)",
      runGated("care_homes", ["s185_plus_own_s25"], H1_ELECTION).r.QE, [340000, 340000]);

    /* ---------------------------------------------------------------------
       H2 - D-5 (item 12843022045), gated on D-Q4.
       Urenco widened "on the provision of" for List C items 1-21. Today
       installation and commissioning reach a claim only through s.25, and
       only where they can be tied to a named parent element.
       Money: UNDERSTATES claims.
       --------------------------------------------------------------------- */
    const H2_BASE = { trigger: ["refurb_fitout"], scale: "multi" };
    const H2_PROV = Object.assign({ provision_of_expenditure: 50000 }, H2_BASE);
    const h2ref = hi(run("dental", H2_BASE).r);
    check("H2 branch B — commissioning spend with no named parent element is dropped",
      near(hi(run("dental", H2_PROV).r), h2ref), true);
    check("H2 branch A — Urenco admits it as expenditure on the provision of a List C item",
      near(hi(runGated("dental", ["urenco_provision_of"], H2_PROV).r), h2ref + 50000), true);
    check("H2 branch A — and it is de-duplicated against an s.25 line for the same spend",
      near(hi(runGated("dental", ["urenco_provision_of"],
        Object.assign({ s25_alterations_expenditure: 50000 }, H2_PROV)).r), h2ref), true);

    /* ---------------------------------------------------------------------
       H3 - E-4 (item 12851707697), gated on E-Q2.
       CA11520 accepts specialised supported housing may not be a
       dwelling-house at all. Today there is no branch for it and the
       common-parts ceiling always applies.
       Money: UNDERSTATES claims, and loses a market.
       --------------------------------------------------------------------- */
    const H3 = { trigger: ["refurb_fitout"], specialised_supported_housing: "yes" };
    const h3ref = hi(run("supported_living", { trigger: ["refurb_fitout"] }).r);
    check("H3 branch B — the common-parts ceiling applies whatever the care model",
      near(hi(run("supported_living", H3).r), h3ref), true);
    check("H3 branch A — specialised supported housing lifts the common-parts ceiling entirely",
      near(hi(runGated("supported_living", ["specialised_supported_housing"], H3).r), h3ref / 0.25), true);

    /* ---------------------------------------------------------------------
       H4 - E-5 (item 12851716860), gated on E-Q6.
       A dwelling factor is applied to trades and professions, where s.35(1)
       arguably cannot reach them because of s.15(3). A manager's or
       practitioner's flat held for the purposes of the trade should not be
       stripped out at all.
       Money: WRONG BASIS.
       --------------------------------------------------------------------- */
    const H4_PLAIN = { trigger: ["refurb_fitout"], scale: "multi" };
    const H4_FLAT = Object.assign({ dwelling_setting: "mixed", residential_fraction: 0.2,
                                    residential_purpose: "trade_purpose" }, H4_PLAIN);
    const h4ref = hi(run("dental", H4_PLAIN).r);
    check("H4 branch B — the residential part is stripped out regardless of why it is there",
      near(hi(run("dental", H4_FLAT).r), h4ref * 0.8), true);
    check("H4 branch A — a flat held for the purposes of the trade is not stripped out",
      near(hi(runGated("dental", ["trade_not_s35"], H4_FLAT).r), h4ref), true);
    check("H4 branch A — but a flat LET to a third party still comes out, on its own footing",
      near(hi(runGated("dental", ["trade_not_s35"],
        Object.assign({}, H4_FLAT, { residential_purpose: "let" })).r), h4ref * 0.8), true);

    /* ---------------------------------------------------------------------
       H5 - E-8 (item 12851716705), gated on E-Q4.
       Supported Living runs the s.187A triage on purchases from landlords
       who were themselves barred by s.35 and so were arguably never
       "entitled to claim".
       Money: FALSE NEGATIVES.
       --------------------------------------------------------------------- */
    /* PHASE 132, 14 September 2026 (second builder): earlier_entitled_owner
       "no" added. E-8 is narrowed as the 28 August finding asked, so branch A
       needs no earlier entitled owner KNOWN in the chain as well as a barred
       seller. Branch B is unaffected. */
    const H5 = {
      trigger: ["purchase"], prior_owner_claimed: "yes", prior_owner_entitled: "yes",
      prior_owner_s35_barred: true, earlier_entitled_owner: "no",
      election_document: "exists_not_held", election_value: 50000
    };
    check("H5 branch B — the s.187A / election triage runs on a s.35-barred seller",
      typeof run("supported_living", H5).s.election_outcome, "object");
    check("H5 branch A — a seller who was never entitled does not engage s.187A at all",
      typeof runGated("supported_living", ["s187a_needs_entitled_owner"], H5).s.election_outcome, "undefined");
    check("H5 branch A — and the unresolved s.185 ceiling is flagged, not silently uncapped",
      runGated("supported_living", ["s187a_needs_entitled_owner"], H5)
        .s.flags.some(f => /s\.187A NOT ENGAGED/.test(f)), true);

    /* THE NARROWING, SWITCH ON (Phase 132, 14 September 2026). s.187A is
       disengaged only where nobody in the chain could claim. N4 on BOTH facts:
       "not sure" and absent are each asserted, never one standing for both. */
    {
      const E8 = ["s187a_needs_entitled_owner"];
      const h5On = extra => runGated("supported_living", E8, Object.assign({}, H5, extra));
      const h5Without = key => { const st = Object.assign({}, H5); delete st[key]; return runGated("supported_living", E8, st); };
      const triage = x => [typeof x.s.election_outcome, x.s.flags.some(f => /s\.187A NOT ENGAGED/.test(f))];
      check("H5 branch A (narrowing) — an earlier entitled owner in the chain keeps s.187A engaged, and nothing is flagged",
        triage(h5On({ earlier_entitled_owner: "yes" })), ["object", false]);
      check("H5 N4 — switch on, an earlier owner \"not sure\" and ABSENT both still run the triage, unflagged (both asserted)",
        [triage(h5On({ earlier_entitled_owner: "unsure" })), triage(h5Without("earlier_entitled_owner"))],
        [["object", false], ["object", false]]);
      check("H5 N4 — switch on, the seller's bar \"not sure\" (null) and ABSENT behave as branch B: triage runs, nothing flagged, the switch-off figure (both asserted)",
        [null, undefined].map(v => {
          const x = (v === null) ? h5On({ prior_owner_s35_barred: null }) : h5Without("prior_owner_s35_barred");
          const offSt = Object.assign({}, H5); if (v === null) offSt.prior_owner_s35_barred = null; else delete offSt.prior_owner_s35_barred;
          const off = run("supported_living", offSt);
          return triage(x).concat([near(hi(x.r), hi(off.r)), near(lo(x.r), lo(off.r))]);
        }),
        [["object", false, true, true], ["object", false, true, true]]);

      /* the flow half: the narrowed switch must be feedable from the questions */
      const qOfE = (sector, gates, id) => (liftGated(sector, gates).Q || []).find(q => q.id === id);
      const BARRED = { trigger: ["purchase"], prior_owner_entitled: "yes", prior_owner_s35_barred: true };
      check("H5 flow — off, the earlier-owner question is asked after a non-entitled seller only, as shipped",
        [!!qOfE("care_homes", [], "Q12b")?.showIf(BARRED), !!qOfE("care_homes", [], "Q12b")?.showIf({ trigger: ["purchase"], prior_owner_entitled: "no" })],
        [false, true]);
      check("H5 flow — on, a seller KNOWN to be barred has the chain behind them asked about in all five flows; a bar \"not sure\" does not",
        ["Q", "D", "S", "G", "H"].map((p, i) => [!!qOfE(SECTORS[i], E8, p + "12b")?.showIf(BARRED),
          !!qOfE(SECTORS[i], E8, p + "12b")?.showIf(Object.assign({}, BARRED, { prior_owner_s35_barred: null }))]),
        [[true, false], [true, false], [true, false], [true, false], [true, false]]);
      /* PHASE 132i - the seller question now sits straight before x12b in every flow (CB_CTAQ.place), so x12b
         itself asks about the chain behind a barred seller, and the second asking (x51eeo) is retired. Until
         then x12b read a fact only a later question set, and a second pass forward asked it when the first had not. */
      /* PHASE 153b, 4 October 2026 (Word question 73): the extra seller question x51barred is retired, as Lakhbir
         asked ("Do not ask anything, Just find out who they purchased the property off"). The seller question x12
         records the fact E-8 reads, and it comes before the earlier-owner question in every flow. */
      check("H5 flow — the extra seller question (x51barred) and the old follow-up (x51eeo) are gone from all five flows, switch on and off, and the seller question comes before the earlier-owner question",
        [E8, []].map(g => ["Q", "D", "S", "G", "H"].map((p, i) => { const Q = liftGated(SECTORS[i], g).Q || [];
          const at = id => Q.findIndex(q => q.id === id);
          return [at(p + "51barred"), at(p + "51eeo"), at(p + "12") >= 0 && at(p + "12") < at(p + "12b")]; })),
        [E8, []].map(() => ["Q", "D", "S", "G", "H"].map(() => [-1, -1, true])));
      {
        const S12 = qOfE("supported_living", E8, "S12"), S12b = qOfE("supported_living", E8, "S12b");
        const st = { trigger: ["purchase"], deal: "property", flags: [], assumptions: [] };
        S12.onSet(st, "residential_landlord");
        check("H5 flow — supported living: the private residential landlord answer leads straight to the chain question with E-8 on, and not with it off",
          [!!S12b.showIf(st), !!qOfE("supported_living", [], "S12b")?.showIf(st)], [true, false]);
      }
    }

    /* ---------------------------------------------------------------------
       H6 - F-3 (item 12852269900), gated on F-Q3.
       The grant strip runs before the dwelling factor, so a scheme-wide
       grant percentage is deducted from the whole base and then cut again to
       common parts. Two reductions for one payment.
       Money: UNDERSTATES claims.
       --------------------------------------------------------------------- */
    const H6 = { trigger: ["refurb_fitout"], grant_fraction: 0.4 };
    const h6ref = hi(run("supported_living", { trigger: ["refurb_fitout"] }).r);
    check("H6 branch B — a scheme-wide grant is deducted before the common-parts cut",
      near(hi(run("supported_living", H6).r), h6ref * 0.6), true);
    check("H6 branch A — an untraced scheme-wide grant reduces the common-parts base by nothing",
      near(hi(runGated("supported_living", ["grant_traced_after_dwelling"], H6).r), h6ref), true);
    check("H6 branch A — a grant TRACED to the claimable areas still comes off, at its traced rate",
      near(hi(runGated("supported_living", ["grant_traced_after_dwelling"],
        Object.assign({ grant_traced_fraction: 0.4 }, H6)).r), h6ref * 0.6), true);

    /* H6-CH - F-3 IN CARE HOMES. PHASE 132, 14 September 2026 (second builder).
       The same double reduction in the one care-home case that has it:
       self-contained units let to residents, where the claim is cut to the
       communal and care areas. Where that factor is 1 there is no second cut
       and the switch must change nothing at all. */
    {
      const F3 = ["grant_traced_after_dwelling"];
      const CHL = { trigger: ["refurb_fitout"], activity: "letting", dwelling_setting: "self_contained" };
      const H6CH = Object.assign({ grant_fraction: 0.4 }, CHL);
      const chRef = run("care_homes", CHL).r;
      const sameQE = (a, b) => near(lo(a), lo(b)) && near(hi(a), hi(b));
      const f3Flag = r => r.flags.some(f => /\(F-3\)/.test(f));
      const offCH = run("care_homes", H6CH).r;
      check("H6-CH branch B — letting self-contained units, a scheme-wide grant comes off the whole base before the communal cut",
        [near(hi(offCH), hi(chRef) * 0.6), near(lo(offCH), lo(chRef) * 0.6), f3Flag(offCH), offCH.grant], [true, true, false, true]);
      const onUntr = runGated("care_homes", F3, H6CH).r;
      check("H6-CH branch A — untraced, the grant reduces the communal base by nothing, is flagged, and the grant flag is false",
        [sameQE(onUntr, chRef), f3Flag(onUntr), onUntr.grant], [true, true, false]);
      const onTr = runGated("care_homes", F3, Object.assign({ grant_traced_fraction: 0.4 }, H6CH)).r;
      check("H6-CH branch A — traced to the communal and care areas, the grant comes off at its traced rate and is not flagged",
        [near(hi(onTr), hi(chRef) * 0.6), near(lo(onTr), lo(chRef) * 0.6), f3Flag(onTr), onTr.grant], [true, true, false, true]);
      const fpCH = r => JSON.stringify([r.QE, r.TS, r.cash, r.flags, r.assumptions, r.grant, r.outcome]);
      check("H6-CH — where the dwelling factor is 1 (a trading home; a letting home that is not self-contained) the switch changes nothing: figure, words, flags",
        [{ activity: "trade", dwelling_setting: "institution_commercial" }, { activity: "letting", dwelling_setting: "shared" }]
          .map(f => { const st = Object.assign({ trigger: ["refurb_fitout"], grant_fraction: 0.4, grant_traced_fraction: 0.1 }, f);
                      return fpCH(run("care_homes", st).r) === fpCH(runGated("care_homes", F3, st).r); }),
        [true, true]);
      /* N4: a blank traced-share box and a traced share never given are the
         same, in both sectors F-3 reaches. The flow passes 0 for a blank box
         and, where the question is optional, null. */
      [["supported_living", H6], ["care_homes", H6CH]].forEach(([sec, st]) => {
        const E = liftGated(sec, F3);
        const q = (E.Q || []).find(x => /51gtr$/.test(x.id));
        const fp = r => JSON.stringify([r.QE, r.flags, r.assumptions, r.grant]);
        const absent = fp(E.runEngine(base(st)));
        check("H6 N4 — " + sec + ": switch on, 51gtr left blank (\"\", 0, null) gives exactly what an absent traced share gives",
          ["", 0, null].map(v => { if (!q) return "no 51gtr question in " + sec; const s = base(st); q.onSet(s, v); return fp(E.runEngine(s)) === absent; }),
          [true, true, true]);
      });
    }

    /* ---------------------------------------------------------------------
       H7 - F-6 (item 12852267228), gated on F-Q1.
       Connected-party contributions are treated as reducing the occupier's
       spend, where s.537(2)(c) may block the contributor and leave the
       occupier's spend standing in full.
       Money: UNDERSTATES claims.
       --------------------------------------------------------------------- */
    const H7 = { trigger: ["refurb_fitout"], landlord_contrib_fraction: 0.3,
                 contributor_connected: "yes" };
    const h7ref = hi(run("care_homes", { trigger: ["refurb_fitout"] }).r);
    check("H7 branch B — a landlord contribution is deducted whoever the landlord is",
      near(hi(run("care_homes", H7).r), h7ref * 0.7), true);
    check("H7 branch A — a connected contributor leaves the occupier's spend standing in full",
      near(hi(runGated("care_homes", ["connected_contributor_no_reduction"], H7).r), h7ref), true);
    check("H7 branch A — an UNCONNECTED contribution is still deducted",
      near(hi(runGated("care_homes", ["connected_contributor_no_reduction"],
        Object.assign({}, H7, { contributor_connected: "no" })).r), h7ref * 0.7), true);

    /* PHASE 132, 14 September 2026 (second builder). F-6's N4, and F-8's words
       inside the switched path, in all four sectors that carry the strip.
       CAA 2001 s.536(6) keeps structures and buildings allowance reduced;
       s.536(2) needs a contributor that is not a public body. */
    {
      const F6 = ["connected_contributor_no_reduction"];
      ["care_homes", "dental", "gp", "private_hospital"].forEach(sec => {
        const ref = hi(run(sec, { trigger: ["refurb_fitout"] }).r);
        const st = extra => Object.assign({ trigger: ["refurb_fitout"], landlord_contrib_fraction: 0.3 }, extra);
        const on = extra => runGated(sec, F6, st(extra)).r;
        const unflagged = r => !r.flags.some(f => /CONNECTED CONTRIBUTION NOT DEDUCTED/.test(f));
        const rNull = on({ contributor_connected: null }), rAbsent = on({});
        check("H7 N4 — " + sec + ": switch on, connected \"not sure\" (null) and ABSENT both still deduct, unflagged (both asserted)",
          [near(hi(rNull), ref * 0.7), unflagged(rNull), near(hi(rAbsent), ref * 0.7), unflagged(rAbsent)], [true, true, true, true]);
        const rYes = on({ contributor_connected: "yes" });
        check("H7 branch A — " + sec + ": a connected contributor stands in full, and F-8 says s.536(6) still reduces SBA and s.536(2) needs a non-public contributor",
          [near(hi(rYes), ref), rYes.assumptions.some(a => /s\.536\(6\)/.test(a)), rYes.flags.some(f => /s\.536\(2\)/.test(f))],
          [true, true, true]);
        const rOff = run(sec, st({ contributor_connected: "yes" })).r;
        check("H7 branch B — " + sec + ": switch off, the F-8 words are absent even for a connected contributor",
          [rOff.assumptions.some(a => /s\.536\(6\)/.test(a)), rOff.flags.some(f => /s\.536\(2\)/.test(f))], [false, false]);
        check("H7 branch A — " + sec + ": the F-8 words are not said where the switch leaves the deduction in place",
          [rNull.assumptions.some(a => /s\.536\(6\)/.test(a)), rAbsent.flags.some(f => /s\.536\(2\)/.test(f))], [false, false]);
      });
    }

    /* SL-C1 - SUPPORTED LIVING'S LANDLORD CONTRIBUTION, BUILT OFF. PHASE 132,
       14 September 2026 (second builder); item 12852267228, check item
       12927221788 ("gap, not deliberate"). The flow never asked for one, so
       today's LIVE behaviour - no deduction - is recorded as well as the switch. */
    {
      const SLC = ["sl_landlord_contribution"];
      const SLST = extra => Object.assign({ trigger: ["refurb_fitout"] }, extra);
      const CONTRIB = { landlord_contrib_answer: "yes", landlord_contrib_fraction: 0.3 };
      const slRef = run("supported_living", SLST()).r;
      const fpSL = r => JSON.stringify([r.QE, r.TS, r.cash, r.cashRoute, r.flags, r.assumptions, r.grant, r.outcome]);
      check("H7 SL-C1 — recorded 14 September 2026: supported living deducts no landlord contribution today, whatever the session carries",
        near(hi(run("supported_living", SLST(CONTRIB)).r), hi(slRef)), true);
      check("H7 SL-C1 branch B — off, a session carrying a 30% contribution is byte for byte the session without one",
        fpSL(run("supported_living", SLST(CONTRIB)).r) === fpSL(slRef), true);
      const slOn = runGated("supported_living", SLC, SLST(CONTRIB)).r;
      check("H7 SL-C1 branch A — on, a known 30% contribution comes off the spend before the common-parts share, and is named",
        [near(hi(slOn), hi(slRef) * 0.7), slOn.assumptions.some(a => /landlord contribution to the works removed \(30% of spend\)/.test(a))],
        [true, true]);
      const E = liftGated("supported_living", SLC);
      const qa = (E.Q || []).find(q => q.id === "S51slc"), qv = (E.Q || []).find(q => q.id === "S51slcv");
      const u = base(SLST()); if (qa) qa.onSet(u, "unsure");
      const ru = E.runEngine(u), ra = E.runEngine(base(SLST()));
      check("H7 SL-C1 N4 — on, \"not sure\" and ABSENT deduct nothing and give today's figure; only \"not sure\" is flagged as not assumed nil (both asserted)",
        [near(hi(ru), hi(slRef)), near(hi(ra), hi(slRef)), ru.flags.some(f => /NOT assumed nil/.test(f)), ra.flags.some(f => /NOT assumed nil/.test(f)), !!(qv && qv.showIf(u))],
        [true, true, true, false, false]);
      const slcShown = (sector, gates, st) => (liftGated(sector, gates).Q || []).filter(q => /51slcv?$/.test(q.id) && q.showIf(st)).map(q => q.id);
      check("H7 SL-C1 — the questions: none with the switch off, the first with it on, the share only after a yes, and none in any other sector",
        [slcShown("supported_living", [], { landlord_contrib_answer: "yes" }), slcShown("supported_living", SLC, {}),
         slcShown("supported_living", SLC, { landlord_contrib_answer: "yes" }),
         ["care_homes", "dental", "gp", "private_hospital"].map(sec => slcShown(sec, SLC, { landlord_contrib_answer: "yes" }).length)],
        [[], ["S51slc"], ["S51slc", "S51slcv"], [0, 0, 0, 0]]);
    }

    /* ---------------------------------------------------------------------
       H8 - F-10 (item 12852259255), gated on F-Q4.
       s.185(1)(c) and s.187A(1)(c) both exclude plant a past owner held as a
       result of s.538, so where entitlement arose only via a contribution
       allowance neither cap may engage.
       Money: UNDERSTATES claims.
       --------------------------------------------------------------------- */
    const H8 = {
      trigger: ["purchase"], prior_owner_entitled: "no", prior_owner_claimed: "no",
      earlier_entitled_owner: "yes", earlier_disposal_value: 120000,
      past_owner_entitlement_route: "contribution_only"
    };
    check("H8 branch B — the s.185 cap bites however the past owner became entitled",
      near(hi(run("care_homes", H8).r), 120000), true);
    check("H8 branch A — a past owner entitled only via s.538 is carved out of the cap",
      hi(runGated("care_homes", ["s538_carveout"], H8).r) > 120000, true);
    /* RESTATED 14 September 2026 (Phase 132, second builder). E-8 is narrowed,
       so the two carve-outs fire together only where no earlier owner is known
       to have been entitled. prior_owner_claimed "yes" keeps F-10's question
       reachable on those facts. RECORDED, NOT DECIDED: whether a past owner
       entitled ONLY through s.538 counts as "entitled" for s.187A belongs to
       E-Q4 with F-Q4, and this suite asserts neither reading of it. */
    const H8_E8 = Object.assign({}, H8, { prior_owner_s35_barred: true, earlier_entitled_owner: "no", prior_owner_claimed: "yes" });
    check("H8 branch A — and the compounding with E-Q4 is flagged when both carve-outs fire",
      runGated("care_homes", ["s538_carveout", "s187a_needs_entitled_owner"], H8_E8)
        .s.flags.some(f => /BOTH CARVE-OUTS FIRE/.test(f)), true);
    check("H8 — with an earlier entitled owner known (\"yes\"), the narrowed E-8 does not fire, so there is no BOTH CARVE-OUTS flag",
      runGated("care_homes", ["s538_carveout", "s187a_needs_entitled_owner"],
        Object.assign({ prior_owner_s35_barred: true }, H8))
        .s.flags.some(f => /BOTH CARVE-OUTS FIRE/.test(f)), false);

    /* ---------------------------------------------------------------------
       H9 - A-2 (item 12921346993), gated on A-Q8.
       s.187A(6)(b) is a THIRD route to satisfying the fixed value
       requirement - two written statements under s.187A(8) where the owner in
       between was never able to claim - and IT HAS NO TIME LIMIT. The engine
       offers only the election and the tribunal, both of which die with the
       two-year period.
       Money: UNDERSTATES claims, and on a closed window it is the difference
       between a live claim and none.

       Asserted against CB_S187A directly: this defect changes an outcome and
       a question set inside the shared module, not a sector arithmetic path.
       --------------------------------------------------------------------- */
    const S187A_OFF = layerGated([]).CB_S187A;
    const S187A_A2  = layerGated(["s187a_6b_statements_route"]).CB_S187A;

    /* an intervening owner who bought in 2015: the two-year period ran from
       THEIR purchase and closed in 2017. The statements exist and are held. */
    const H9 = {
      prior_owner_entitled: "no", earlier_entitled_owner: "yes",
      prior_owner_claimed: "yes",
      past_owner_disposal_mode: "sold_market",
      intervening_owner_acquisition_date: "2015-01-01",
      intervening_owner_never_entitled: "yes",
      s187a_8_statements: "held",
      __now: "2026-08-31"
    };
    check("H9 branch B — a closed window is unresolved however good the statements are",
      S187A_OFF.assess(H9).outcome, "INDET");
    check("H9 branch A — the s.187A(6)(b) statements route satisfies a closed window",
      S187A_A2.assess(H9).outcome, "SATISFIED");
    check("H9 branch A — statements not produced does NOT relieve, it stays unresolved",
      S187A_A2.assess(Object.assign({}, H9, { s187a_8_statements: "exists_not_held" })).outcome,
      "INDET");
    check("H9 branch A — an in-between owner who COULD have claimed does not open the route",
      S187A_A2.assess(Object.assign({}, H9, { intervening_owner_never_entitled: "no" })).outcome,
      "INDET");

    /* the wording half: an open window must stop saying "two routes, both
       with a deadline" once a third route with no deadline is available. */
    const H9_OPEN = Object.assign({}, H9, { intervening_owner_acquisition_date: "2025-06-01" });
    check("H9 branch B — an open window names the election and the tribunal only",
      /no deadline/.test(S187A_OFF.assess(H9_OPEN).why), false);
    check("H9 branch A — an open window also names the route that has no deadline",
      /no deadline/.test(S187A_A2.assess(H9_OPEN).why), true);

    /* The question half: two questions that are NOT ASKED today. They are
       present in the array either way - it is showIf that gates them, so
       that is what is asserted. A client answering the flow with the switch
       off sees neither. */
    const H9_FLOW = {
      trigger: ["purchase"], deal: "property",
      prior_owner_entitled: "no", earlier_entitled_owner: "yes",
      prior_owner_claimed: "yes", intervening_owner: "yes",
      intervening_owner_never_entitled: "yes"
    };
    const shown = (gates, re) => (liftGated("care_homes", gates).Q || [])
      .filter(q => re.test(q.id))
      .filter(q => !!(q.showIf && q.showIf(H9_FLOW))).length;
    check("H9 branch B — neither s.187A(8) question is put to the client",
      shown([], /14ivne$|14st8$/), 0);
    check("H9 branch A — both s.187A(8) questions are put to the client",
      shown(["s187a_6b_statements_route"], /14ivne$|14st8$/), 2);

    /* ---------------------------------------------------------------------
       H10 - A-3 (item 12921346994), gated on B-Q4.
       s.187A(5) hangs the fixed value requirement on the past owner having
       been required to bring a disposal value into account under s.196 Table
       item 1, 5 or 9. An owner who never claimed brings none, so on that
       reading the requirement never applies - and the engine should not be
       asking the fixed-value questions at all.
       Money: UNDERSTATES claims.

       THIS IS NOT R-B1. R-B1 is the POOLING requirement (s.187A(4)) on an
       entitled owner who never pooled, and it points the other way. The two
       are deliberately not coupled.
       PHASE 154a1 (line 13), 4 October 2026: R-B1 IS NOW BUILT (Suite G, C1),
       and it is asked FIRST (Rulebook A Addendum 1, F1 before F2): a seller who
       never pooled, after April 2014, takes the claim to nil whichever reading
       of the fixed value requirement is switched on. So H10's seller now
       stopped owning in 2013 - the pooling requirement is not in force there
       (FA 2012 Sch 10 para 13(2), branch D) - and the checks below still test
       the A-3 switch and nothing else. H10p shows the switch cannot reach a
       case the pooling requirement decides.
       --------------------------------------------------------------------- */
    const S187A_A3 = layerGated(["fvr_requires_past_owner_claim"]).CB_S187A;

    const H10 = {
      prior_owner_entitled: "yes", prior_owner_claimed: "no",
      earlier_entitled_owner: "no",
      past_owner_disposal_mode: "sold_market",
      past_owner_cessation_date: "2013-06-01",
      acquisition_date: "2024-01-01", __now: "2026-08-31"
    };
    const H10P = Object.assign({}, H10);
    delete H10P.past_owner_cessation_date;
    check("H10p — with no sale date the pooling requirement decides first, switch off or on",
      [S187A_OFF.assess(H10P).requirement, S187A_A3.assess(H10P).requirement, S187A_A3.assess(H10P).outcome],
      ["POOLING", "POOLING", "INDET"]);
    check("H10 branch B — the fixed value track runs even where nobody ever claimed",
      S187A_OFF.assess(H10).track, "FVR");
    check("H10 branch A — a past owner who never claimed takes s.187A off entirely",
      S187A_A3.assess(H10).outcome, "OFF");
    check("H10 branch A — an UNKNOWN claim history does not relieve",
      S187A_A3.assess(Object.assign({}, H10, { prior_owner_claimed: "unsure" })).outcome,
      "INDET");
    check("H10 branch A — an earlier entitled owner further back does not relieve",
      S187A_A3.assess(Object.assign({}, H10, { earlier_entitled_owner: "yes" })).outcome,
      "INDET");
    check("H10 branch A — and it does not decide the separate pooling requirement",
      /pooled/.test(S187A_A3.assess(H10).action || ""), true);

    /* the question half: the whole s.187A block drops out of the flow. */
    const H10_STATE = Object.assign({ trigger: ["purchase"], deal: "property" }, H10);
    const q14po = e => (e.Q || []).find(q => /14po$/.test(q.id));
    check("H10 branch B — the s.187A questions are asked whatever the claim history",
      !!q14po(liftGated("care_homes", [])).showIf(H10_STATE), true);
    check("H10 branch A — they are not asked where the past owner never claimed",
      !!q14po(liftGated("care_homes", ["fvr_requires_past_owner_claim"])).showIf(H10_STATE), false);
    check("H10 branch A — but they ARE still asked where the claim history is unknown",
      !!q14po(liftGated("care_homes", ["fvr_requires_past_owner_claim"]))
        .showIf(Object.assign({}, H10_STATE, { prior_owner_claimed: "unsure" })), true);

    /* ---------------------------------------------------------------------
       H11 - THE SWITCHBOARD ITSELF. Every switch ships off. This is the one
       assertion that would catch somebody flipping one by hand, or a merge
       resolving the wrong way, before it reached a client.
       --------------------------------------------------------------------- */
    const CTA = layerGated([]).CB_CTA;
    const SWITCHES = ["s185_plus_own_s25", "urenco_provision_of",
      "specialised_supported_housing", "trade_not_s35", "s187a_needs_entitled_owner",
      "grant_traced_after_dwelling", "connected_contributor_no_reduction",
      "s538_carveout", "s187a_6b_statements_route", "fvr_requires_past_owner_claim",
      /* the eleventh, added by Phase 96 on 7 September 2026 */
      "transaction_tax_in_base",
      /* the twelfth, added by Phase 113j on 10 September 2026 */
      "grant_after_ceilings",
      /* five more, added by Phase 129 on 12 September 2026 - H15 to H19 */
      "legal_fees_in_base", "self_contained_flats_stop", "shared_lounge_claimable",
      "fvr_clock_from_client_purchase", "scottish_rate_from_main_home",
      /* the eighteenth, added by Phase 129a on 13 September 2026 - H23 */
      "lease_premium_not_item9",
      /* the nineteenth, added by Phase 129b on 13 September 2026 - Suite W */
      "window_from_later_spend_period",
      /* four more, added by Phase 132 on 14 September 2026 - Suite X */
      "s33b_aggregation", "ct_rate_from_associated_companies", "income_tax_taper_band",
      "window_company_member_date",
      /* the twenty-fourth, added by Phase 132's second builder on 14 September 2026 - H7 SL-C1 */
      "sl_landlord_contribution",
      /* the twenty-fifth, added by Phase 153a on 4 October 2026 - H24, read by the back end's survey pack */
      "grant_traced_to_elements",
      /* four more, added by Phase 153b on 4 October 2026 - Suite AI */
      "election_missing_utr_fixable", "election_wrong_section_accepted", "election_value_cut_to_lawful_max",
      "registered_provider_not_public_body"];
    check("H11 — the switchboard carries exactly the prepared readings listed here, no more and no fewer",
      Object.keys(CTA).sort(), SWITCHES.slice().sort());
    check("H11 — EVERY switch ships OFF — no tax position has been taken",
      SWITCHES.filter(k => CTA[k] !== false), []);

    /* ---------------------------------------------------------------------
       H12 - THE QUESTIONS THE SWITCHED BRANCHES NEED (CB_CTAQ).

       A switch nobody can feed is a switch that does nothing, so eight of the
       ten branches carry a question of their own. Every one of them must be
       INVISIBLE while its switch is off - otherwise Phase 51 has changed what
       clients are asked, which is exactly what it promised not to do - and
       VISIBLE once its switch is on and its own precondition is met,
       otherwise flipping the switch achieves nothing.
       --------------------------------------------------------------------- */
    /* one fat state that meets every precondition at once */
    const H12_STATE = {
      trigger: ["purchase", "refurb_fitout"], deal: "property",
      base_amount: 2000000, claimant_type: "company",
      dwelling_setting: "mixed", residential_fraction: 0.2,
      grant_fraction: 0.4, landlord_contrib_fraction: 0.3,
      prior_owner_entitled: "yes", prior_owner_claimed: "yes",
      earlier_entitled_owner: "yes"
    };
    const ctaQ = (sector, gates) => (liftGated(sector, gates).Q || [])
      .filter(q => /^[A-Z]51/.test(q.id));
    const visible = (sector, gates) => ctaQ(sector, gates)
      .filter(q => !!(q.showIf && q.showIf(H12_STATE))).map(q => q.id.replace(/^[A-Z]/, ""));

    SECTORS.forEach(sec => {
      check("H12 branch B — " + sec + ": no Phase 51 question is put to the client",
        visible(sec, []), []);
    });

    /* and each one appears when, and only when, its own switch goes on */
    check("H12 branch A — D-5 asks for the commissioning spend",
      visible("dental", ["urenco_provision_of"]), ["51prov"]);
    check("H12 branch A — E-4 asks whether care is delivered on site",
      visible("supported_living", ["specialised_supported_housing"]), ["51ssh"]);
    check("H12 branch A — E-5 asks what the residential part is used for",
      visible("dental", ["trade_not_s35"]), ["51resp"]);
    check("H12 branch A — F-6 asks whether the contributor is connected",
      visible("care_homes", ["connected_contributor_no_reduction"]), ["51conn"]);
    check("H12 branch A — F-3 asks how much grant is traced to the common parts",
      visible("supported_living", ["grant_traced_after_dwelling"]), ["51gtr"]);
    /* PHASE 153b (Word question 73): E-8 asks nothing of its own any more - it reads the seller question. */
    check("H12 branch A — E-8 asks no question of its own: it reads who the seller was (Phase 153b, Word question 73)",
      visible("care_homes", ["s187a_needs_entitled_owner"]), []);
    check("H12 branch A — F-10 asks how the past owner became entitled",
      visible("care_homes", ["s538_carveout"]), ["51route"]);

    /* E-5 and F-3 are sector-scoped: the question does not appear where the
       defect does not live, even with the switch on. */
    check("H12 branch A — E-5 has no question in supported living, which is not a trade",
      visible("supported_living", ["trade_not_s35"]), []);
    check("H12 branch A — F-3 has no question outside supported living and self-contained care homes",
      visible("care_homes", ["grant_traced_after_dwelling"]), []);
    {
      /* PHASE 132, 14 September 2026 (second builder): F-3 reaches a care home
         letting self-contained units, and nothing else changes. */
      const LETTING = Object.assign({}, H12_STATE, { activity: "letting", dwelling_setting: "self_contained" });
      const shownIn = (sector, gates, st) => ctaQ(sector, gates).filter(q => !!(q.showIf && q.showIf(st))).map(q => q.id.replace(/^[A-Z]/, ""));
      check("H12 branch A — F-3 asks a care home letting self-contained units, and only with its switch on",
        [shownIn("care_homes", ["grant_traced_after_dwelling"], LETTING), shownIn("care_homes", [], LETTING)], [["51gtr"], []]);
      check("H12 branch A — F-3 still asks nothing in dental, GP or private hospitals, even on letting facts",
        ["dental", "gp", "private_hospital"].map(sec => shownIn(sec, ["grant_traced_after_dwelling"], LETTING)), [[], [], []]);
    }

    /* GC-1 (Phase 113j) needs no question of its own: it keys off the grant
       share every sector already asks for. So switching it on must put nothing
       new to the client, in any sector. */
    SECTORS.forEach(sec => {
      check("H12 branch A — GC-1 puts no new question to the client: " + sec,
        visible(sec, ["grant_after_ceilings"]), []);
    });

    /* ---------------------------------------------------------------------
       H13 - SD-1 (item 12975610449), gated on the stamp-duty question in the
       adviser pack. THE ELEVENTH SWITCH, added by Phase 96 on 7 Sep 2026.

       Does the transaction tax paid on an acquisition sit INSIDE the
       consideration that gets apportioned under s.562?
       Money: UNDERSTATES claims on every purchase where tax was paid.

       Branch B is the whole point of this one. A competitor's published
       report puts the tax inside the base and our own CB_JURIS assumption
       line already tells clients outside England that acquisition costs ARE
       added - so the pressure to "just turn it on" is real, and branch B is
       what would catch someone doing it. It is asserted per sector, because
       the base line it patches was inserted five separate times.
       --------------------------------------------------------------------- */
    const H13_PURCHASE = { trigger: ["purchase"], deal: "property",
                           base_amount: 2000000, transaction_tax_paid: 90000,
                           nation: "england" };

    SECTORS.forEach(sec => {
      const off = run(sec, H13_PURCHASE).r;
      const on  = runGated(sec, ["transaction_tax_in_base"], H13_PURCHASE).r;
      check("H13 branch B — " + sec + ": the transaction tax stays OUT of the base",
        [near(lo(off), lo(run(sec, Object.assign({}, H13_PURCHASE, { transaction_tax_paid: 0 })).r)),
         near(hi(off), hi(run(sec, Object.assign({}, H13_PURCHASE, { transaction_tax_paid: 0 })).r))],
        [true, true]);
      /* 90,000 on 2,000,000 is 4.5% more base, so 4.5% more qualifying
         spend - the apportionment is linear in the base and nothing else
         about the case changed. */
      check("H13 branch A — " + sec + ": the base rises by the tax paid, and QE rises with it",
        [near(hi(on), hi(off) * 2090000 / 2000000), hi(on) > hi(off)],
        [true, true]);
    });

    /* An unknown adds nothing. This is the same N4 discipline as everywhere
       else: the switch being ON does not license a guess at the amount. */
    check("H13 branch A — with the switch on but no amount stated, nothing is added",
      near(hi(runGated("care_homes", ["transaction_tax_in_base"],
             Object.assign({}, H13_PURCHASE, { transaction_tax_paid: 0 })).r),
           hi(run("care_homes", H13_PURCHASE).r)),
      true);

    /* It is a tax on ACQUIRING. A fit-out is not an acquisition, so even with
       the switch on and an amount sitting in the session, nothing is added. */
    check("H13 branch A — a fit-out is not a purchase, so nothing is added to it",
      near(hi(runGated("care_homes", ["transaction_tax_in_base"],
             Object.assign({}, H13_PURCHASE, { trigger: ["fitout"] })).r),
           hi(run("care_homes", Object.assign({}, H13_PURCHASE, { trigger: ["fitout"] })).r)),
      true);

    /* THE NATION POINT. A switch that hard-codes "SDLT" is wrong in two of
       the four nations the jurisdiction layer already knows about, so the
       name in the client-facing assumption is resolved through CB_JURIS. */
    const ACQ = layerGated(["transaction_tax_in_base"]).CB_ACQ;
    check("H13 — the tax is named per nation, not hard-coded as SDLT",
      ["england", "ni", "wales", "scotland"].map(n => ACQ.taxName({ nation: n })),
      ["SDLT", "SDLT", "LTT", "LBTT"]);
    check("H13 — and an uncaptured nation falls back the same way the rest of the engine does",
      ACQ.taxName({}), "SDLT");
    (function(){
      const A = [], s = Object.assign({ flags: [] }, H13_PURCHASE, { nation: "scotland" });
      const CTAon = layerGated(["transaction_tax_in_base"]);
      const out = CTAon.CB_ACQ.addToBase(s, 2000000, A, f => s.flags.push(f));
      check("H13 — a Scottish purchase is told about LBTT, never about SDLT",
        [out, A.some(a => /LBTT/.test(a)), A.some(a => /SDLT/.test(a))],
        [2090000, true, false]);
    })();

    /* H13 branch B, said once more against the module rather than the
       engines: with the switch off addToBase is the identity function, and
       it says nothing to the client either. */
    (function(){
      const A = [], flags = [];
      const out = layerGated([]).CB_ACQ.addToBase(
        Object.assign({}, H13_PURCHASE), 2000000, A, f => flags.push(f));
      check("H13 branch B — with the switch off the base is untouched and nothing is said",
        [out, A.length, flags.length], [2000000, 0, 0]);
    })();

    /* ---------------------------------------------------------------------
       H14 - GC-1 (item 13014647417), gated on the grant-and-ceiling question
       for the tax adviser. THE TWELFTH SWITCH, added by Phase 113j on
       10 Sep 2026.

       A grant-funded purchase that is also capped: does the grant come off
       the SPEND before the ceiling is applied, or off the capped FIGURE after
       it? Money: today's order is the FAVOURABLE one. On, claims get SMALLER,
       and only where a ceiling binds.

       Asserted per sector against Suite G's two ceilings - B2's earlier
       owner's £120,000 disposal value and C2's £300,000 election - because
       the strip this moves was inserted five separate times. Each ceiling is
       also run SET LOOSE (above any figure these facts produce), which is how
       "the ceiling binds" is measured here rather than assumed: branch B is
       today's figure = the loose figure capped at the ceiling; branch A is the
       no-grant figure net of the grant, flagged exactly when a ceiling bound.
       --------------------------------------------------------------------- */
    const GC1 = ["grant_after_ceilings"];
    const H14_GRANT = { grant_answer: "some", grant_fraction: 0.4 };
    const H14_DV = { prior_owner_entitled: "no", prior_owner_claimed: "no",
                     earlier_entitled_owner: "yes", earlier_disposal_value: 120000 };
    const H14_ELECT = { prior_owner_claimed: "yes", prior_owner_entitled: "yes",
      election_document: "held", election_content: SIX, election_value: 300000,
      acquisition_date: "2026-01-01", election_notified_date: "2026-02-01",
      transaction_type: "sale", election_multi_property: "no", election_scope: "all_fixtures" };
    /* loose: well above anything these facts produce, well below the price */
    const LOOSE = 1900000;
    const H14_DV_LOOSE = Object.assign({}, H14_DV, { earlier_disposal_value: LOOSE });
    const H14_ELECT_LOOSE = Object.assign({}, H14_ELECT, { election_value: LOOSE });
    const withG = f => Object.assign({}, f, H14_GRANT);
    const gc1Flag = r => r.flags.some(f => /\(GC-1\)/.test(f));
    const sameQE = (a, b) => near(lo(a), lo(b)) && near(hi(a), hi(b));
    const capAt = (r, c) => ({ QE: [Math.min(lo(r), c), Math.min(hi(r), c)] });
    const netOf = (r, k) => ({ QE: [lo(r) * k, hi(r) * k] });

    SECTORS.forEach(sec => {
      const X = f => Object.assign({ sector: sec }, f);
      [["a disposal-value ceiling", H14_DV, H14_DV_LOOSE, 120000],
       ["an election", H14_ELECT, H14_ELECT_LOOSE, 300000]].forEach(([what, capped, loose, cap]) => {
        const offG  = run(sec, X(withG(capped))).r;
        const offGL = run(sec, X(withG(loose))).r;
        const offN  = run(sec, X(capped)).r;
        const offNL = run(sec, X(loose)).r;
        const onG   = runGated(sec, GC1, X(withG(capped))).r;
        const onGL  = runGated(sec, GC1, X(withG(loose))).r;
        const bound = !sameQE(offN, offNL);
        check("H14 branch B — " + sec + ", " + what + ": the grant comes off the spend first, the ceiling is applied to what is left, and nothing is flagged",
          [sameQE(offG, capAt(offGL, cap)), gc1Flag(offG)], [true, false]);
        check("H14 branch A — " + sec + ", " + what + ": the ceiling is applied first and the grant's 40% comes off the capped figure, flagged exactly when the ceiling bound",
          [sameQE(onG, netOf(offN, 0.6)), gc1Flag(onG) === bound], [true, true]);
        check("H14 branch A — " + sec + ", " + what + " set loose enough not to bind: the switch changes nothing and says nothing",
          [sameQE(onGL, offGL), gc1Flag(onGL)], [true, false]);
      });
    });

    /* The example the tax adviser is given, pinned so the documents cannot
       drift from the engine: £120,000 today, £72,000 on the other reading. */
    {
      const CH = f => Object.assign({ sector: "care_homes" }, withG(H14_DV));
      check("H14 — the adviser's example: £2m care home, 40% grant, £120,000 disposal value is £120,000 off and £72,000 on",
        [Math.round(hi(run("care_homes", CH()).r)), Math.round(hi(runGated("care_homes", GC1, CH()).r))],
        [120000, 72000]);
    }

    /* GP: the arithmetic takes the switch, the wording does not. GP's grant
       sentences carry a legal caveat still with the adviser (Phase 113i), so
       they are pinned unchanged here rather than trusted to stay so. */
    {
      const GPX = Object.assign({ sector: "gp" }, withG(H14_DV));
      const gpOff = run("gp", GPX).r, gpOn = runGated("gp", GC1, GPX).r;
      const grantWords = r => r.assumptions.filter(a => /grant/i.test(a)).join(" | ");
      check("H14 — GP's arithmetic takes the switch and its grant sentences do not change with it",
        [hi(gpOn) < hi(gpOff), grantWords(gpOn) === grantWords(gpOff), grantWords(gpOff).length > 0],
        [true, true, true]);
    }

    /* SUPPORTED LIVING: GC-1 WITH F-3. The site decides it in terms at that
       sector's Stage 1 - F-3 says HOW MUCH of the grant comes off, GC-1 says
       WHEN - so the two compose rather than one overriding the other. Asserted
       on B2's facts, where every one of the four combinations is a different
       figure: 75,000 / 112,500 / 72,000 / 108,000. */
    {
      const F3 = ["grant_traced_after_dwelling"], BOTH = F3.concat(GC1);
      const SL = f => Object.assign({ sector: "supported_living" }, f);
      const TRACED = { grant_traced_fraction: 0.1 };
      const slNoG      = run("supported_living", SL(H14_DV)).r;
      const bothUntr   = runGated("supported_living", BOTH, SL(withG(H14_DV))).r;
      const f3Tr       = runGated("supported_living", F3, SL(Object.assign(withG(H14_DV), TRACED))).r;
      const f3TrLoose  = runGated("supported_living", F3, SL(Object.assign(withG(H14_DV_LOOSE), TRACED))).r;
      const bothTr     = runGated("supported_living", BOTH, SL(Object.assign(withG(H14_DV), TRACED))).r;
      const neither    = run("supported_living", SL(withG(H14_DV))).r;
      const gc1Only    = runGated("supported_living", GC1, SL(withG(H14_DV))).r;
      check("H14 with F-3 — both on, grant NOT traced: nothing comes off early or late, only the F-3 flag is raised, and the grant flag stays false",
        [near(hi(bothUntr), hi(slNoG)), gc1Flag(bothUntr), bothUntr.flags.some(f => /\(F-3\)/.test(f)), bothUntr.grant],
        [true, false, true, false]);
      check("H14 with F-3 — F-3 alone, traced 10%: the traced rate comes off the spend, and the ceiling is applied to what is left",
        [near(hi(f3Tr), Math.min(hi(f3TrLoose), 120000)), gc1Flag(f3Tr)], [true, false]);
      check("H14 with F-3 — both on, traced 10%: the TRACED rate, not the scheme-wide one, comes off after the ceiling",
        [near(hi(bothTr), hi(slNoG) * 0.9), gc1Flag(bothTr), bothTr.grant], [true, true, true]);
      check("H14 with F-3 — the four combinations give four different figures on these facts",
        [hi(neither), hi(f3Tr), hi(gc1Only), hi(bothTr)].map(Math.round), [75000, 112500, 72000, 108000]);
    }

    /* ---------------------------------------------------------------------
       H15 to H22 - PHASE 129, 12 September 2026.
       --------------------------------------------------------------------- */

    /* H15 - LF-1 (item 12975610449, second half): legal and incidental
       acquisition costs in the s.562 base. Independent of SD-1. */
    const H15_PURCHASE = Object.assign({}, H13_PURCHASE, { acquisition_legal_fees_paid: 40000 });
    SECTORS.forEach(sec => {
      const off  = run(sec, H15_PURCHASE).r;
      const none = run(sec, Object.assign({}, H15_PURCHASE, { acquisition_legal_fees_paid: 0 })).r;
      const on   = runGated(sec, ["legal_fees_in_base"], H15_PURCHASE).r;
      const both = runGated(sec, ["legal_fees_in_base", "transaction_tax_in_base"], H15_PURCHASE).r;
      check("H15 branch B — " + sec + ": legal and incidental acquisition costs stay OUT of the base",
        [near(lo(off), lo(none)), near(hi(off), hi(none))], [true, true]);
      check("H15 branch A — " + sec + ": the base rises by the costs stated, with the tax switch still off",
        [near(hi(on), hi(off) * 2040000 / 2000000), hi(on) > hi(off)], [true, true]);
      check("H15 branch A — " + sec + ": with both switches on, the tax and the costs both come in",
        near(hi(both), hi(off) * 2130000 / 2000000), true);
    });
    check("H15 branch A — with the switch on, an amount of nothing and an ABSENT amount both add nothing (N4)",
      [near(hi(runGated("care_homes", ["legal_fees_in_base"], Object.assign({}, H15_PURCHASE, { acquisition_legal_fees_paid: 0 })).r), hi(run("care_homes", H15_PURCHASE).r)),
       near(hi(runGated("care_homes", ["legal_fees_in_base"], Object.assign({}, H13_PURCHASE)).r), hi(run("care_homes", H15_PURCHASE).r))],
      [true, true]);
    check("H15 branch A — a fit-out is not an acquisition, so nothing is added to it",
      near(hi(runGated("care_homes", ["legal_fees_in_base"], Object.assign({}, H15_PURCHASE, { trigger: ["fitout"] })).r),
           hi(run("care_homes", Object.assign({}, H15_PURCHASE, { trigger: ["fitout"] })).r)),
      true);
    (function(){
      const A = [], flags = [];
      const out = layerGated([]).CB_ACQ.addToBase(Object.assign({}, H15_PURCHASE), 2000000, A, f => flags.push(f));
      check("H15 branch B — with both acquisition switches off the base is untouched and nothing is said",
        [out, A.length, flags.length], [2000000, 0, 0]);
    })();
    check("H15 — the costs question is put to the client only with its switch on",
      [visible("gp", []).includes("51legal"), visible("gp", ["legal_fees_in_base"])], [false, ["51legal"]]);

    /* H16 - FL-1, FOR THE ACCOUNTANT ACC-D2: several self-contained homes in
       supported living. Shipped 26 August behind no switch. */
    {
      const S6a = gates => (liftGated("supported_living", gates).Q || []).find(q => q.id === "S6a");
      const FL = ["self_contained_flats_stop"];
      const gateOf = (gates, setting) => { const g = S6a(gates).gate({ dwelling_setting: setting }); return g ? g.type : null; };
      const three = gates => ["dh_multi_selfcontained", "single_dwelling", "dh_multi_shared"].map(x => gateOf(gates, x));
      check("H16 branch B — several self-contained homes proceed, as shipped on 26 August; only a single dwelling stops",
        three([]), [null, "neg", null]);
      check("H16 branch A — several self-contained homes stop at a reasoned negative; the other two do not move",
        three(FL), ["neg", "neg", null]);
      check("H16 branch A — and the negative tells the client it is a switched position",
        /switched position/.test(S6a(FL).gate({ dwelling_setting: "dh_multi_selfcontained" }).msg), true);
    }

    /* H17 - LG-1, FOR THE ACCOUNTANT ACC-D3.1: a shared lounge outside the homes in
       a scheme of self-contained homes. Shipped 20 August behind no switch. */
    {
      const LG = ["shared_lounge_claimable"];
      const q = (gates, id) => (liftGated("supported_living", gates).Q || []).find(x => x.id === id);
      const SC = { dwelling_setting: "dh_multi_selfcontained", has_common: false };
      const negOf = (gates, st) => { const g = q(gates, "S6b").gate(Object.assign({}, st)); return g ? g.type : null; };
      check("H17 branch B — the shared-lounge question is not asked",
        !!q([], "S6bl").showIf(Object.assign({}, SC)), false);
      check("H17 branch A — it is asked of self-contained homes, and not where rooms share facilities",
        [!!q(LG, "S6bl").showIf(Object.assign({}, SC)), !!q(LG, "S6bl").showIf({ dwelling_setting: "dh_multi_shared" })],
        [true, false]);
      check("H17 branch B — a shared lounge alone does not carry a scheme past the no-common-parts negative",
        negOf([], Object.assign({ shared_lounge_common: true }, SC)), "neg");
      check("H17 branch A — it does, in a scheme of self-contained homes",
        negOf(LG, Object.assign({ shared_lounge_common: true }, SC)), null);
      check("H17 branch A — 'not sure' and ABSENT both leave the negative in place (N4, both asserted)",
        [negOf(LG, Object.assign({ shared_lounge_common: null }, SC)), negOf(LG, Object.assign({}, SC))], ["neg", "neg"]);
      check("H17 branch A — and it never reaches a scheme whose rooms share facilities",
        negOf(LG, { dwelling_setting: "dh_multi_shared", has_common: false, shared_lounge_common: true }), "neg");
      const SLF = { sector: "supported_living", dwelling_setting: "dh_multi_selfcontained", shared_lounge_common: true };
      const offR = run("supported_living", SLF).r, onR = runGated("supported_living", LG, SLF).r;
      check("H17 — the ceiling does not move either way; only what the client is told follows the switch",
        [near(hi(offR), hi(onR)),
         offR.assumptions.some(a => /shared kitchens\/lounges and any central plant/.test(a)),
         onR.assumptions.some(a => /treated as a common part \(a switched position\)/.test(a))],
        [true, true, true]);
    }

    /* H18 - CL-1, FOR THE ACCOUNTANT ACC-D3.2: whose purchase starts the two-year
       clock. Shipped at Phase 50 behind no switch. */
    {
      const CL = ["fvr_clock_from_client_purchase"];
      const OFFm = layerGated([]).CB_S187A, ONm = layerGated(CL).CB_S187A;
      const H18 = { past_owner_disposal_mode: "sold_market", intervening_owner: "yes",
                    intervening_owner_acquisition_date: "2020-01-01",
                    acquisition_date: "2025-06-01", __now: "2026-08-31" };
      const win = (M, st) => { const x = M.fvrWindow(Object.assign({}, st)); return [x.basis, x.open]; };
      check("H18 branch B — the clock runs from the intervening owner's purchase, so this window has closed",
        win(OFFm, H18), ["intervening_acquisition", false]);
      check("H18 branch A — it runs from the client's own completion, so the same window is open",
        win(ONm, H18), ["client_acquisition", true]);
      check("H18 branch A — the client's date ABSENT or unparseable opens nothing (N4, both asserted)",
        [win(ONm, Object.assign({}, H18, { acquisition_date: undefined }))[1],
         win(ONm, Object.assign({}, H18, { acquisition_date: "not sure" }))[1]],
        [null, null]);
      check("H18 branch B — the intervening owner's date unknown: not determinable, and the client's date is not substituted",
        win(OFFm, Object.assign({}, H18, { intervening_owner_acquisition_date: undefined })),
        ["intervening_acquisition", null]);
    }

    /* H19 - RH-1 (item 12889350666): the Scottish rate follows the taxpayer's
       main home, not the property. */
    {
      const RH = ["scottish_rate_from_main_home"];
      const OFFr = layerGated([]).CB_RATES, ONr = layerGated(RH).CB_RATES;
      const key = (R, st) => { const fl = []; return [R.unincKey(Object.assign({}, st), f => fl.push(f)), fl.length]; };
      const scotProp = { is_scotland: true }, engProp = { is_scotland: false };
      check("H19 branch B — the property's nation decides the key, whatever the main home, and nothing is said",
        [key(OFFr, Object.assign({ main_home_nation: "rest_uk" }, scotProp)), key(OFFr, Object.assign({ main_home_nation: "scotland" }, engProp))],
        [["uninc_scot", 0], ["uninc_ruk", 0]]);
      check("H19 branch A — a KNOWN main home decides it",
        [key(ONr, Object.assign({ main_home_nation: "rest_uk" }, scotProp)), key(ONr, Object.assign({ main_home_nation: "scotland" }, engProp))],
        [["uninc_ruk", 0], ["uninc_scot", 0]]);
      check("H19 branch A — an unknown main home keeps the proxy and says so; not established and ABSENT are identical (N4)",
        [key(ONr, Object.assign({ main_home_nation: null }, scotProp)), key(ONr, Object.assign({}, scotProp))],
        [["uninc_scot", 1], ["uninc_scot", 1]]);
      const INDIV = Object.assign({}, H12_STATE, { claimant_type: "sole_trader" });
      const homeQ = (gates, st) => ctaQ("dental", gates).filter(x => /51home$/.test(x.id) && x.showIf(st)).length;
      check("H19 — the main-home question: not asked with the switch off, not asked of a company, asked of an individual",
        [homeQ([], INDIV), homeQ(RH, H12_STATE), homeQ(RH, INDIV)], [0, 0, 1]);
    }

    /* H20 - C-4's client-facing sentence now follows its switch (item
       12840979279). Before Phase 129 it said "on top" with the switch off. */
    (function(){
      const say = (gates, st) => { const A = []; layerGated(gates).CB_S25.caveats(st, A); return A; };
      const off = say([], { s25_alterations_expenditure: 40000 });
      const on  = say(["s185_plus_own_s25"], { s25_alterations_expenditure: 40000 });
      check("H20 branch B — the client is told their alterations were kept INSIDE the cap, and never that they sit on top",
        [off.some(a => /kept inside any election cap/.test(a)), off.some(a => /sit on top of any election cap/.test(a))],
        [true, false]);
      check("H20 branch A — the client is told they sit on top, which the switched arithmetic makes true",
        [on.some(a => /sit on top of any election cap/.test(a)), on.some(a => /kept inside any election cap/.test(a))],
        [true, false]);
      check("H20 — with no alteration spend neither sentence is said, either way",
        [say([], {}).length, say(["s185_plus_own_s25"], {}).length], [1, 1]);
    })();

    /* H21 - the jurisdiction sentence now follows the stamp duty switch (item
       12975610449). Before Phase 129 it told every Welsh client acquisition
       costs were added while nothing was. */
    (function(){
      const say = (gates, nation) => {
        const s = { assumptions: [], flags: [] };
        layerGated(gates).CB_JURIS.question({ id: "x", group: "g" }).onSet(s, nation);
        return s.assumptions.join(" | ");
      };
      const TX = ["transaction_tax_in_base"];
      check("H21 branch B — a Welsh client is told LTT is NOT added, and never that acquisition costs are",
        [/LTT, not SDLT, and this estimate does not add it/.test(say([], "wales")), /acquisition costs added/.test(say([], "wales"))],
        [true, false]);
      check("H21 branch A — with the stamp duty switch on, LTT is named as what is added",
        /the tax added to the figure the claim is apportioned from \(s\.562\) is LTT/.test(say(TX, "wales")), true);
      check("H21 — an English client is told neither, either way",
        [/not SDLT/.test(say([], "england")), /not SDLT/.test(say(TX, "england"))], [false, false]);
    })();

    /* H22 - E-8's flow defect (item 12851716705): the private residential
       landlord answer renders with the switch OFF and moves no figure. */
    {
      const S12 = (liftGated("supported_living", []).Q || []).find(x => x.id === "S12");
      check("H22 — the private residential landlord answer renders with E-8's switch off",
        S12.opts.map(o => o[0]).includes("residential_landlord"), true);
      const a = { assumptions: [], flags: [] }, b = { assumptions: [], flags: [] };
      S12.onSet(a, "residential_landlord"); S12.onSet(b, "taxpaying");
      check("H22 — it records the seller as entitled, as the old truthful answer did, and records the fact E-8 reads",
        [a.prior_owner_entitled, b.prior_owner_entitled, a.prior_owner_s35_barred, b.prior_owner_s35_barred],
        ["yes", "yes", true, undefined]);
      const SLP = { sector: "supported_living", prior_owner_claimed: "no" };
      const viaLandlord  = run("supported_living", Object.assign({ prior_owner_entitled: "yes", prior_owner_s35_barred: true }, SLP)).r;
      const viaTaxpaying = run("supported_living", Object.assign({ prior_owner_entitled: "yes" }, SLP)).r;
      check("H22 branch B — with E-8 off the new answer moves no figure",
        [near(lo(viaLandlord), lo(viaTaxpaying)), near(hi(viaLandlord), hi(viaTaxpaying))], [true, true]);
    }

    /* H23 - I9-1 (item 13033203928). PHASE 129a, 13 September 2026.
       Item 9 of the s.196 Table is "permanent discontinuance of the qualifying
       activity followed by the sale of the qualifying interest", and s.198(1)
       reaches items 1 and 9, both sales. The engine reads a lease granted for
       a premium with no joint s.183 election as item 9, in two places. Off
       keeps that reading; on, neither place takes a Table item as established.
       Money moves either way, so a direction is asserted each way, and a
       NOT-SURE and an ABSENT election position are asserted alike (N4). */
    {
      const I9 = ["lease_premium_not_item9"];
      const OFF = layerGated([]), ON = layerGated(I9);
      const po = v => ({ past_owner_disposal_mode: "new_lease_premium", past_owner_s183_election: v });
      const item = (M, v) => { const d = M.CB_S187A.disposalItem(po(v)); return [d.item, d.track]; };

      check("H23 branch B — the past owner's lease premium with no joint election is item 9, on the fixed value track",
        item(OFF, "no"), ["196/9", "FVR"]);
      check("H23 branch A — on, the same facts are given no Table item: UNKNOWN, on the UNKNOWN track",
        item(ON, "no"), ["unknown", "UNKNOWN"]);
      check("H23 — a not-sure and an absent election position are UNKNOWN on both readings (N4)",
        [item(OFF, null), item(OFF, undefined), item(ON, null), item(ON, undefined)],
        [["unknown", "UNKNOWN"], ["unknown", "UNKNOWN"], ["unknown", "UNKNOWN"], ["unknown", "UNKNOWN"]]);
      check("H23 branch A — a joint election is still item 5, and an ordinary sale still item 1",
        [item(ON, "yes")[0], ON.CB_S187A.disposalItem({ past_owner_disposal_mode: "sold_market" }).item],
        ["196/5", "196/1"]);

      /* the s.187A outcome - an open window, bought directly from the past owner */
      const OPEN = v => Object.assign({ __now: "2026-08-31T00:00:00Z", claimant_type: "company",
        prior_owner_claimed: "yes", prior_owner_entitled: "yes", acquisition_date: "2026-01-01" }, po(v));
      const a = (M, v) => M.CB_S187A.assess(OPEN(v));
      check("H23 branch B — an open window on those facts is LIVE, on the fixed value track",
        [a(OFF, "no").outcome, a(OFF, "no").track], ["LIVE", "FVR"]);
      check("H23 branch A — on, it is unresolved with the bottom of the range at nil: money moves DOWN here",
        [a(ON, "no").outcome, a(ON, "no").track, a(ON, "no").switched], ["INDET", "UNKNOWN", "lease_premium_not_item9"]);
      check("H23 branch A — its capture step names the tax adviser, not another question for the client",
        [/route not established/.test(a(ON, "no").action), /tax adviser/.test(a(ON, "no").action)], [true, true]);
      check("H23 branch A — a not-sure and an absent election position keep their own capture step (N4)",
        [/establish how the earlier owner/.test(a(ON, null).action), /establish how the earlier owner/.test(a(ON, undefined).action),
         !!a(ON, null).switched, !!a(ON, undefined).switched],
        [true, true, false, false]);

      /* CB_ELECTION.section - the client's own lease */
      const secOf = (M, v) => M.CB_ELECTION.section({ transaction_type: "lease_premium", s183_election_made: v });
      const sec = (M, v) => { const r = secOf(M, v); return [r.section, r.item, r.available]; };
      check("H23 branch B — the client's lease premium with no s.183 election is s.198, item 9, available",
        sec(OFF, "no"), ["s.198", 9, true]);
      check("H23 branch A — on, neither section nor item is established, and availability is not known",
        sec(ON, "no"), [null, null, null]);
      check("H23 branch A — it says so, and says who answers it",
        [/not established/.test(secOf(ON, "no").why), /tax adviser/.test(secOf(ON, "no").action), secOf(ON, "no").switched],
        [true, true, "lease_premium_not_item9"]);
      check("H23 — a not-sure and an absent s.183 position are not established on both readings (N4)",
        [sec(OFF, null), sec(OFF, undefined), sec(ON, null), sec(ON, undefined)],
        [[null, null, null], [null, null, null], [null, null, null], [null, null, null]]);
      check("H23 branch A — a joint s.183 election is still s.199, item 5, and a sale still s.198, item 1",
        [sec(ON, "yes"), ON.CB_ELECTION.section({ transaction_type: "sale" }).item], [["s.199", 5, true], 1]);

      /* the election outcome - a complete document made under s.199 on those facts */
      const doc = (v, extra) => Object.assign({ election_document: "held", election_content: SIX, election_value: 400000,
        acquisition_date: "2026-01-01", election_notified_date: "2026-02-01", transaction_type: "lease_premium",
        election_multi_property: "no", election_scope: "all_fixtures", base_amount: 2000000,
        election_section: "s.199", s183_election_made: v }, extra || {});
      const CLOSED = { acquisition_date: "2019-01-01", election_notified_date: "2019-02-01" };
      const el = (M, v, extra) => M.CB_ELECTION.assess(doc(v, extra)).outcome;
      check("H23 branch B — made under s.199 on those facts it is the wrong section: LIVE inside the window, unresolved outside",
        [el(OFF, "no"), el(OFF, "no", CLOSED)], ["LIVE", "INDET"]);
      check("H23 branch A — on, it is not called wrong-section and is sized on its face: money moves UP outside the window",
        [el(ON, "no"), el(ON, "no", CLOSED)], ["CAP-ELECT", "CAP-ELECT"]);
      check("H23 branch A — exactly as a not-sure and an absent s.183 position are treated on both readings (N4)",
        [el(OFF, null), el(OFF, undefined), el(ON, null), el(ON, undefined), el(OFF, null, CLOSED), el(ON, undefined, CLOSED)],
        ["CAP-ELECT", "CAP-ELECT", "CAP-ELECT", "CAP-ELECT", "CAP-ELECT", "CAP-ELECT"]);

      /* the words follow the switch - the five flows' own-lease flag, and the s.187A block's */
      const unsure = (sector, gates, re) => {
        const q = (liftGated(sector, gates).Q || []).find(x => re.test(x.id));
        const st = { flags: [], assumptions: [] }; q.onSet(st, "unsure"); return st.flags.join(" | ");
      };
      SECTORS.forEach(sector => {
        check("H23 branch B — " + sector + ": the unknown s.183 flag names item 9, as it always has",
          /s\.198 \(Table item 9\)/.test(unsure(sector, [], /14s3$/)), true);
        const onText = unsure(sector, I9, /14s3$/);
        check("H23 branch A — " + sector + ": on, it no longer calls a lease item 9",
          [/item 9/.test(onText), /not established/.test(onText)], [false, true]);
      });
      check("H23 branch B — the past owner's unknown-election flag names item 5 and item 9",
        /item 5 and item 9/.test(unsure("care_homes", [], /14pol$/)), true);
      const polOn = unsure("care_homes", I9, /14pol$/);
      check("H23 branch A — on, it does not call the lease item 9",
        [/item 9/.test(polOn), /not established/.test(polOn)], [false, true]);
    }

    /* ---------------------------------------------------------------------
       H24 - F-15's REMAINDER (item 12852269899), gated on the grant-trace
       question. PHASE 153a, 4 October 2026. grant_traced_to_elements is read
       by the back end's survey pack, where each line is a fixture-list row
       and a grant on the claim record can name the rows it paid for
       (09-app/backend/src/web/pack-grants.ts, tested there both ways). The
       public estimate holds no row-by-row spend, so every grant in it is
       untraced and keeps the grant_fraction route whichever way the switch
       sits - the figure, the flags and the words, in all five sectors.
       --------------------------------------------------------------------- */
    SECTORS.forEach(sec => {
      const st = () => Object.assign({ sector: sec, trigger: ["refurb_fitout"] }, H14_GRANT);
      const off = run(sec, st()).r;
      const on = runGated(sec, ["grant_traced_to_elements"], st()).r;
      check("H24 — " + sec + ": the public estimate keeps the grant_fraction route whichever way grant_traced_to_elements sits",
        [lo(on), hi(on), on.flags.join(" | "), (on.assumptions || []).join(" | ")],
        [lo(off), hi(off), off.flags.join(" | "), (off.assumptions || []).join(" | ")]);
      check("H24 — " + sec + ": and the grant still comes off it (the switch is no way to drop a grant)",
        hi(off) < hi(run(sec, { sector: sec, trigger: ["refurb_fitout"] }).r), true);
    });
  }
}

/* =============================================================================
   SUITE I — Phase 9: prepared work behind the licences and the surveyor
   =============================================================================
   Board 18422317809. Plan doc 46256300.

   WHAT PHASE 9 BUILT, AND WHY IT IS NOT IN THE SHIPPED FILE

     The four LEG-E engine fixes (E2 preliminaries, E3 professional fees,
     E4 location and contract size, E5 per-element depreciation) are fixes to
     the RESIDUAL REPLACEMENT-COST model in Build-Prep-Care-Homes-Estimate-
     Engine-Specification.md sections 4.1-4.3. That model had never been
     implemented — caprebate-site.html values a claim from sector yield
     bands. There was no code to patch. Phase 9 therefore built the model, with
     the four corrections designed in and held behind gates, in

         phase9/caprebate-cost-model.cjs

     and its own assertions in caprebate-cost-model.test.cjs, which are
     run separately with `node --test`. This suite does NOT duplicate them.
     It asserts the three things that are this harness's business:

       I1-I2  the prepared module ships inert — every gate false, every
              licensed or purchased table empty. This is the safety guarantee,
              so it is asserted here as well as there.
       I3-I5  the mechanisms actually work when a gate is forced on over a
              hand-invented fixture, so "prepared" means prepared and not
              merely sketched.
       I6-I8  the shipped engine has NOT taken any of it up. These are the
              xfails, and they are the point of the suite.

   THE xfail SIGNAL, same convention as Suite H

     I6-I8 assert the SHIPPED state that Phase 9 is waiting for — that
     caprebate-site.html consumes the cost model. Today it does not, the
     assertion fails, and it is declared xfail. The day someone wires the
     module into the site these start XPASSing and this harness goes loudly
     red. That is intended: it means the prepared work has shipped and this
     suite must be converted from xfail to ordinary assertions, with the
     gate-off branches kept as the proof of the default.

   WHAT IS BLOCKED ON WHAT — the four are not blocked alike
     LEG-E2  12804374366  VOA licence — QUERIED, see the module header and the
                          closing comment on the item. The change removes a
                          multiplier and reproduces no VOA data.
     LEG-E3  12804380489  VOA licence — genuinely so; the fee scale IS the data.
     LEG-E4  12804374707  BCIS (chosen over Spon's, 24 Sep 2026) — a
                          subscription AND a licence: Word question 218,
                          item 12804374406.
     LEG-E5  12804317685  TWO sources — VOA obsolescence scales AND CIBSE plant
                          lives. Clearing the VOA licence alone does not
                          unblock it.
     BASIS   12804374838  not blocked at all. Built, tested and DONE.
   ============================================================================= */
if (startSuite("I", "Phase 9 — prepared cost model, gated on licence and purchase")) {

  let CM = null, cmError = null;
  try {
    CM = require(P9 + "/caprebate-cost-model.cjs");
  } catch (e) {
    cmError = e;
  }

  if (cmError) {
    check("the Phase 9 cost model loads", String(cmError), "no error");
  } else {

    /* --- I1-I2: it ships inert ------------------------------------------ */

    check("I1 — every Phase 9 gate ships false, so the module changes no number",
      Object.keys(CM.CB_P9_GATES).filter(k => CM.CB_P9_GATES[k] !== false), []);

    check("I2 — every licensed or purchased table ships empty and unverified",
      Object.keys(CM.CB_P9_TABLES).filter(id => {
        const t = CM.CB_P9_TABLES[id];
        return t.loaded !== false || t.verified_at !== null || !t.licence;
      }), []);

    check("I2b — a gate forced on over an empty stub refuses rather than guessing",
      (function () {
        const codes = [];
        const tries = [
          () => CM.feesFactor({ cost_basis: CM.COST_BASIS.RESIDUAL, construction_cost: 1 },
            { gates: { leg_e3_voa_fee_scale: true } }),
          () => CM.locationAndContractSizeFactor({ location_key: "cardiff" },
            { gates: { leg_e4_location_and_contract_size: true } }),
          () => CM.elementDepreciationFactor({ element_ref: "passenger_lift", age_years: 5 },
            { gates: { leg_e5_per_element_depreciation: true } })
        ];
        tries.forEach(f => { try { f(); codes.push("NO_THROW"); } catch (e) { codes.push(e.code); } });
        return codes;
      })(), ["E_TABLE_NOT_LOADED", "E_TABLE_NOT_LOADED", "E_TABLE_NOT_LOADED"]);

    /* --- I3-I5: the mechanisms work when forced on ----------------------- */
    /* The fixtures below are INVENTED round numbers, not licensed data. The
       one exception is Cardiff 94 against a mean of 100, which is the worked
       example written on board item 12804374707 itself. */

    const FIX = {
      /* Phase 132: a declared national-mean base and the price book it belongs
         to, not a bare mean; LEG-E4 on now also needs a contract value. */
      CB_LOCATION_FACTORS: {
        loaded: true, source: "INVENTED FIXTURE", price_source: "invented_book",
        index_base: { basis: "national_mean", base_key: "national_mean", base_value: 100 },
        factors: { cardiff: 94, national_mean: 100 }
      },
      CB_PRICE_SOURCES: {
        loaded: true, source: "INVENTED FIXTURE",
        sources: { invented_book: { label: "INVENTED BOOK", rates_include_oncosts: null,
          index_base: { basis: "national_mean", base_key: "national_mean", base_value: 100 },
          rates_priced_at_key: "national_mean" } }
      },
      CB_CONTRACT_SIZE_ADJUSTMENT: {
        loaded: true, source: "INVENTED FIXTURE", assumed_contract_value: 3000000,
        quoted_as: "percentage_adjustment", valid_from: 2000000, valid_to: 5000000,
        points: [[2000000, 10], [3000000, 0], [5000000, -5]]
      },
      CB_VOA_FEE_SCALE: {
        loaded: true, source: "INVENTED FIXTURE",
        bands: [[0, 100000, 0.20], [100000, null, 0.10]]
      },
      /* F-1 (Phase 129): the building-type adders, interlocked with the scale.
         Invented; "standard" is 0 so I5's arithmetic is unchanged. */
      CB_VOA_FEE_BUILDING_TYPE_ADDERS: {
        loaded: true, source: "INVENTED FIXTURE",
        adders: { standard: 0, highly_serviced: 0.05, hospital: 0.02 }
      }
    };

    check("I3 — LEG-E2 removes the prelims uplift, and needs no table to do it",
      CM.prelimsFactor({ cost_basis: CM.COST_BASIS.RESIDUAL },
        { gates: { leg_e2_drop_prelims_from_erc: true } }).factor, 1);

    check("I3b — and it does NOT touch the invoice path, where Wetherspoon says add",
      CM.prelimsFactor({ cost_basis: CM.COST_BASIS.INVOICE },
        { gates: { leg_e2_drop_prelims_from_erc: true } }).factor, 1.18);

    check("I4 — LEG-E4 turns Cardiff 94 against a national mean of 100 into a 0.94 factor",
      Math.abs(CM.locationAndContractSizeFactor(
        { location_key: "cardiff", price_source: "invented_book", contract_value: 3000000 },
        { gates: { leg_e4_location_and_contract_size: true }, tables: FIX }
      ).location_factor - 0.94) < 1e-9, true);

    check("I5 — LEG-E3's banded scale is regressive where the flat 15% is not",
      (function () {
        const o = { gates: { leg_e3_voa_fee_scale: true, leg_e3_building_type_adder: true }, tables: FIX };
        const small = CM.feesFactor({ cost_basis: CM.COST_BASIS.RESIDUAL, building_type: "standard", construction_cost: 50000 }, o).rate;
        const large = CM.feesFactor({ cost_basis: CM.COST_BASIS.RESIDUAL, building_type: "standard", construction_cost: 500000 }, o).rate;
        return small > CM.SPEC_FEES_DEFAULT && large < CM.SPEC_FEES_DEFAULT;
      })(), true);

    check("I5a — F-1: the fee scale on WITHOUT its building-type adder refuses, so the under-read cannot ship (Phase 129)",
      (function () {
        try {
          CM.feesFactor({ cost_basis: CM.COST_BASIS.RESIDUAL, building_type: "hospital", construction_cost: 500000 },
            { gates: { leg_e3_voa_fee_scale: true }, tables: FIX });
          return "NO_THROW";
        } catch (e) { return e.code; }
      })(), "E_BUILDING_TYPE_ADDER_REQUIRED");

    check("I5b — the valuation basis defaults to the conservative branch (12804374838, DONE)",
      CM.resolveValuationBasis({}).basis, "drc");

    check("I5c — and that default changes no number today, because LEG-E5 is off",
      CM.resolveValuationBasis({}).depreciation_effective, false);

    /* --- I6-I8: the shipped engine has not taken any of it up ------------ */

    const siteSrc = fs.readFileSync(SITE, "utf8");

    check("I6 — the shipped engine consumes the residual cost model",
      /caprebate-cost-model|CB_P9_GATES|residualApportionment/.test(siteSrc), true,
      { xfail: "LEG-E2/E3/E4/E5 — prepared, not shipped; blocked on the VOA " +
               "licence (E2 queried, E3), the Spon's/BCIS purchase (E4) and " +
               "CIBSE (E5)" });

    check("I7 — the shipped engine carries the LEG-E4 location factor",
      /location_factor|CB_LOCATION_FACTORS/.test(siteSrc), true,
      { xfail: "LEG-E4 12804374707 — prepared, not shipped; blocked on the cost " +
               "library, BCIS: its product and licence are Word question 218 (item 12804374406)" });

    check("I8 — the shipped engine carries the valuation basis switch",
      /valuation_basis|replacement_new/.test(siteSrc), true,
      { xfail: "12804374838 — the switch is built, tested and DONE in phase9/, " +
               "but wiring it into the site waits on the residual model landing" });
  }
}

/* =============================================================================
   SUITE J — Phase 13: document_property_match (12902224596)

   The seven extraction specs in phase3/caprebate-document-pipeline.ts write
   claims against the job's entity, but the entity association came only from
   the upload slot, never from the document's own contents. A care home
   operator with several homes uploads "the fire risk assessment" and gets the
   first one that comes to hand. This suite exercises the fix from OUTSIDE
   phase3/ — the same way Suite I treats the Phase 9 cost model — asserting the
   four scenarios named on the item plus the corroboration-blocking change in
   caprebate-reconciliation.ts. The module's own 189-assertion phase3/ test
   suite (run separately with `node --test phase3/*.test.ts`) is not duplicated
   here.
   ============================================================================= */
if (startSuite("J", "Phase 13 — document_property_match")) {

  let DPM = null, RECON = null, REG = null, dpmError = null;
  try {
    DPM = require(P3 + "/caprebate-document-property-match.ts");
    RECON = require(P3 + "/caprebate-reconciliation.ts");
    REG = require(P3 + "/caprebate-source-register.ts");
  } catch (e) {
    dpmError = e;
  }

  if (dpmError) {
    check("the document_property_match module loads", String(dpmError), "no error");
  } else {

    const SUBJECT = {
      job_id: "J1", address_lines: ["Sunnyside Care Home", "14 Chapel Road", "Anytown"],
      postcode: "SW1A 1AA", uprn: "100023336956", primary_name: "Sunnyside Care Home",
      alternative_names: ["Sunnyside House"],
    };
    const mention = (over) => Object.assign(
      { raw_text: "stub", address_lines: [], postcode: null, uprn: null, site_name: null,
        confidence: 0.97, quote_ref: "p1", page: 1 }, over);

    /* J1 — an FRA for a different property in the same client's group */
    const otherHome = mention({
      raw_text: "Oakwood Care Home, 2 Birch Grove, Anytown, NE1 4ST",
      address_lines: ["Oakwood Care Home", "2 Birch Grove", "Anytown"],
      postcode: "NE1 4ST", uprn: "100023339112", site_name: "Oakwood Care Home",
    });
    let modelCalls = 0;
    const gatedMismatch = DPM.extractWithPropertyGate(
      "J1", "fra-oakwood", "FIRE_RISK_ASSESSMENT", SUBJECT, [otherHome],
      [{ kind: "FINDINGS", heading: "FINDINGS", text: "irrelevant here", page: 1 }],
      () => { modelCalls++; return []; }, { at: "2026-08-27T09:00:00Z", egress: [] }, "2026-08-27T09:00:00Z",
    );
    check("J1 — an FRA for a different property in the group is MISMATCH", gatedMismatch.property_match.outcome, "MISMATCH");
    check("J1 — no claims are written", gatedMismatch.claims, []);
    check("J1 — the model is never called on a mismatched document", modelCalls, 0);
    check("J1 — a review task is raised, asked of our analyst, not a tax adviser we do not have (Phase 146)", gatedMismatch.review.length > 0 && gatedMismatch.review[0].asked_of, "ANALYST");

    /* J2 — an O&M schedule with no address */
    const gatedNotStated = DPM.extractWithPropertyGate(
      "J1", "om-1", "OM_MANUAL", SUBJECT, [],
      [{ kind: "PLANT_SCHEDULE", heading: "PLANT SCHEDULE", text: "AHU-1, chiller, boiler", page: 1 }],
      () => ([{ field_id: "om_plant_items", value: [{ description: "AHU-1" }], confidence: 0.92, page: 4, quote_ref: "p4" }]),
      { at: "2026-08-27T09:00:00Z", egress: [] }, "2026-08-27T09:00:00Z",
    );
    check("J2 — an O&M schedule with no address is NOT_STATED", gatedNotStated.property_match.outcome, "NOT_STATED");
    check("J2 — its claims ARE written", gatedNotStated.claims.length > 0, true);
    check("J2 — every claim is marked NOT_STATED",
      gatedNotStated.claims.every(c => c.retrieval.property_match === "NOT_STATED"), true);

    /* J2b — a NOT_STATED claim cannot corroborate another claim */
    const reg = new REG.SourceRegister({ clock: () => "2026-08-27T09:00:00Z" });
    const notStatedCell = REG.record(reg, {
      entity_id: "J1", field_id: "test_numeric_field", source_id: "CLIENT_DOC",
      retrieval: { retrieved_at: "2026-08-27T09:00:00Z", method: "UPLOAD", locator: "om-1.pdf p4", property_match: "NOT_STATED" },
      value: 500, grade: "B",
    });
    const engineCell = REG.record(reg, {
      entity_id: "J1", field_id: "test_numeric_field", source_id: "ENGINE",
      retrieval: { retrieved_at: "2026-08-27T09:00:00Z", method: "COMPUTED", locator: "derived" },
      value: 500,
    });
    check("J2b — a NOT_STATED claim is not independent of an otherwise-independent one",
      RECON.areIndependent(notStatedCell, engineCell), false);

    /* J3 — a group FRA naming the subject among six */
    const others = ["Oakwood", "Birchwood", "Elmhurst", "Cedarview", "Willowbank"].map((name, i) => mention({
      raw_text: name + " Care Home", address_lines: [name + " Care Home", (i + 1) + " Group Way"],
      postcode: "NE" + i + "Z 1AA", site_name: name + " Care Home",
    }));
    const subjectMention = mention({
      raw_text: "Sunnyside Care Home, 14 Chapel Road, Anytown, SW1A 1AA",
      address_lines: ["Sunnyside Care Home", "14 Chapel Road", "Anytown"],
      postcode: "SW1A 1AA", site_name: "Sunnyside Care Home",
    });
    const groupMatch = DPM.matchProperty("group-fra-1", SUBJECT, others.concat([subjectMention]));
    check("J3 — a group FRA naming the subject among six is MATCH", groupMatch.outcome, "MATCH");
    check("J3 — the portfolio scoping sub-problem is flagged, not solved", groupMatch.portfolio_scoping_risk, true);

    /* J4 — the subject property, with formatting variance */
    const variant = mention({
      raw_text: "14 Chapel Rd, Anytown", address_lines: ["14 Chapel Rd", "Anytown"],
      postcode: null, uprn: null, site_name: null,
    });
    check("J4 — Rd/Road and a missing postcode still MATCH the subject",
      DPM.matchProperty("fra-subject-variant", SUBJECT, [variant]).outcome, "MATCH");
  }
}

/* =============================================================================
   SUITE K — Phase 14: BUILDING_REGS_COMPLETION and GRANT_FUNDING_AGREEMENT
   (12902240772)

   The Stage 2 upload screen asks for ten documents; the pipeline had specs
   for seven. This closes two of the remaining four — the two with no
   dependency. CPSE_REPLIES and SALE_CONTRACT are designed in the same spec
   doc but stay gated on the pipeline DPIA's party-identity question (Phase
   12, item 12910861459) and are NOT built here.

   Also exercises the FinderSpec structural addition (item 12902240772 §6,
   §10) at the mechanism level — SALE_CONTRACT is the type that will use it,
   but the mechanism itself does not depend on that type existing.

   This suite does not duplicate phase3/caprebate-document-pipeline.test.ts
   (P27-P32, F1-F2) or the T5 addition to
   phase3/caprebate-document-property-match.test.ts; it asserts the same
   handful of things from OUTSIDE phase3/, the way Suites I and J do.
   ============================================================================= */
if (startSuite("K", "Phase 14 — BUILDING_REGS_COMPLETION and GRANT_FUNDING_AGREEMENT")) {

  let PIPE = null, DPM2 = null, pipeError = null;
  try {
    PIPE = require(P3 + "/caprebate-document-pipeline.ts");
    DPM2 = require(P3 + "/caprebate-document-property-match.ts");
  } catch (e) {
    pipeError = e;
  }

  if (pipeError) {
    check("the Phase 14 pipeline additions load", String(pipeError), "no error");
  } else {

    /* K1 — the two ungated types are specified, and CPSE_REPLIES / SALE_CONTRACT are not */
    const types = PIPE.DOC_SPECS.map(d => d.doc_type).sort();
    /* Phase 151b: the tax return and the tax computation have specs of their own (Word question 223) — eleven. */
    check("K1 — eleven document types now have a spec", types.length, 11);
    check("K1 — TAX_RETURN and TAX_COMPUTATION are specified (Phase 151b)",
      types.indexOf("TAX_RETURN") >= 0 && types.indexOf("TAX_COMPUTATION") >= 0, true);
    check("K1 — BUILDING_REGS_COMPLETION is specified", types.indexOf("BUILDING_REGS_COMPLETION") >= 0, true);
    check("K1 — GRANT_FUNDING_AGREEMENT is specified", types.indexOf("GRANT_FUNDING_AGREEMENT") >= 0, true);
    check("K1 — CPSE_REPLIES stays gated on the DPIA's party-identity question, not built",
      types.indexOf("CPSE_REPLIES"), -1);
    check("K1 — SALE_CONTRACT stays gated on the same question, not built",
      types.indexOf("SALE_CONTRACT"), -1);

    /* K2 — GRANT_FUNDING_AGREEMENT emits no derived deduction figure of any kind */
    const gfa = PIPE.specFor("GRANT_FUNDING_AGREEMENT");
    check("K2 — the grant spec has no field naming a deduction or allocation",
      gfa.fields.some(x => /deduction|alloc|traced|payable_for/i.test(x.field_id)), false);

    const rawWithConclusion = [
      { field_id: "grant_amount_pence", value: 5000000, confidence: 0.97, page: 1, quote_ref: "p1" },
      { field_id: "grant_traced_deduction_pence", value: 5000000, confidence: 0.99, page: 1, quote_ref: "p1" },
    ];
    const gfaResult = PIPE.extract("doc-k2", "GRANT_FUNDING_AGREEMENT",
      [{ kind: "FUNDING_TERMS", heading: "FUNDING TERMS", text: "x", page: 1 }],
      () => rawWithConclusion, { at: "2026-08-28T09:00:00Z", egress: [] });
    check("K2 — a conclusion volunteered by the model never surfaces as a field",
      gfaResult.fields.some(x => x.field_id === "grant_traced_deduction_pence"), false);

    /* K3 — the property gate (Phase 13) applies to a Phase 14 type unmodified */
    const SUBJECT = {
      job_id: "J1", address_lines: ["Sunnyside Care Home", "14 Chapel Road", "Anytown"],
      postcode: "SW1A 1AA", uprn: "100023336956", primary_name: "Sunnyside Care Home",
      alternative_names: ["Sunnyside House"],
    };
    const otherHome = {
      raw_text: "Oakwood Care Home, 2 Birch Grove, Anytown, NE1 4ST",
      address_lines: ["Oakwood Care Home", "2 Birch Grove", "Anytown"], postcode: "NE1 4ST",
      uprn: "100023339112", site_name: "Oakwood Care Home", confidence: 0.97, quote_ref: "p1", page: 1,
    };
    let k3Calls = 0;
    const gatedBrc = DPM2.extractWithPropertyGate(
      "J1", "brc-oakwood", "BUILDING_REGS_COMPLETION", SUBJECT, [otherHome],
      [{ kind: "CERTIFICATE_BODY", heading: "CERTIFICATE", text: "irrelevant", page: 1 }],
      () => { k3Calls++; return []; }, { at: "2026-08-28T09:00:00Z", egress: [] }, "2026-08-28T09:00:00Z",
    );
    check("K3 — a mismatched Phase 14 document is never sent to the model", k3Calls, 0);
    check("K3 — and contributes no claims, exactly like the seven original types", gatedBrc.claims, []);

    /* K4 — FinderSpec: over-flagging is enforced by the mechanism, not left to callers */
    const finderSpec = {
      finder_id: "election_candidate_finder", from: ["PLANT_SCHEDULE"], asked_of: "CTA",
      question: c => "Confirm whether " + c.quote_ref + " fixes the value of fixtures.",
    };
    const decoyCandidate = { value: "Schedule 4: Fixtures and Fittings (inventory)", page: 55, quote_ref: "p55 sch.4" };
    const realCandidate = { value: "Schedule 6: agreement fixing the value of fixtures", page: 60, quote_ref: "p60 sch.6" };
    const tasks = PIPE.findCandidates(finderSpec, "doc-k4", [decoyCandidate, realCandidate]);
    check("K4 — the decoy schedule is flagged, not suppressed", tasks.length, 2);
    check("K4 — a finder candidate carries no grade", tasks.every(t => !("grade" in t)), true);
  }
}


/* =============================================================================
   SUITE L - s.187A: which requirement, on which clock.
   Phase 50. Board items A-6 (12921347006), A-5 (12921347005),
   A-1 (12921346992), A-4 (12921347004).

   Rulebook: Statutory Rules Register A, Addendum 1, rows A-F1 to A-F30.

   Three things this suite is deliberately built to catch:

     1. THE NIL RETURNS. A-4 exists because the disposal-value-statement cases
        returned a figure where the law returns nil. A suite that only tested
        the paths that produce a number would not have caught it, and would not
        catch it coming back. Every nil branch is asserted as a nil.

     2. UNKNOWN LEAKING INTO THE FAVOURABLE BRANCH. This board already carries
        one defect of exactly that shape - F-2, an unknown grant defaulting to
        nil. Every gate that would relieve the client is tested twice: once
        with the fact known, and once with it absent, asserting that the
        absence does NOT relieve.

     3. THE QUESTIONS STAYING ANSWERABLE. The derivation only holds if nobody
        later "clarifies" a question by putting the statute back into it. The
        last group audits the shipped question text mechanically.
   ============================================================================= */
if (startSuite("L", "s.187A requirements and clocks — A-1, A-4, A-5, A-6")) {

  const S = CB_S187A;
  const NOW = "2026-08-31T00:00:00Z";

  /* a past owner who was entitled and claimed, bought from directly */
  const direct = extra => Object.assign({
    __now: NOW, claimant_type: "company",
    prior_owner_claimed: "yes", prior_owner_entitled: "yes",
    acquisition_date: "2026-01-01"
  }, extra || {});

  /* the same, but with a non-entitled seller in front of an entitled owner */
  const chained = extra => Object.assign({
    __now: NOW, claimant_type: "company",
    prior_owner_claimed: "yes", prior_owner_entitled: "no",
    earlier_entitled_owner: "yes", acquisition_date: "2026-01-01"
  }, extra || {});

  /* ---------------------------------------------------------------- A-6 ---- */
  /* The s.196 Table item, derived from what the client can actually say. */

  check("A-6 — a normal sale by the past owner is item 1, on the fixed-value track",
    S.disposalItem({ past_owner_disposal_mode: "sold_market" }).item, "196/1");
  check("A-6 — and it routes to the fixed value requirement",
    S.disposalItem({ past_owner_disposal_mode: "sold_market" }).track, "FVR");

  check("A-6 — a lease premium WITH a joint election is item 5",
    S.disposalItem({ past_owner_disposal_mode: "new_lease_premium",
                     past_owner_s183_election: "yes" }).item, "196/5");
  check("A-6 — a lease premium WITHOUT one is item 9, and item 9 is still fixed-value",
    S.disposalItem({ past_owner_disposal_mode: "new_lease_premium",
                     past_owner_s183_election: "no" }).track, "FVR");

  check("A-6 — a transfer at an undervalue is item 2, on the STATEMENT track",
    S.disposalItem({ past_owner_disposal_mode: "sold_undervalue" }).item, "196/2");
  check("A-6 — and item 2 does not route to the fixed value requirement",
    S.disposalItem({ past_owner_disposal_mode: "sold_undervalue" }).track, "DVS");
  check("A-6 — ceasing to own without a sale is item 3, statement track",
    S.disposalItem({ past_owner_disposal_mode: "ceased_no_sale" }).track, "DVS");
  check("A-6 — permanent discontinuance is s.61 item 7, statement track",
    S.disposalItem({ past_owner_disposal_mode: "discontinued_trade" }).item, "61/7");

  /* the trap */
  check("A-6 TRAP — nothing answered is UNKNOWN, not the fixed-value track",
    S.disposalItem({}).track, "UNKNOWN");
  check("A-6 TRAP — a lease premium with the election position unknown is UNKNOWN, not item 9",
    S.disposalItem({ past_owner_disposal_mode: "new_lease_premium" }).track, "UNKNOWN");
  check("A-6 TRAP — an unknown item floors the range at nil rather than assuming a track",
    S.assess(direct({})).outcome, "INDET");
  check("A-6 — and it says so as a capture step, not as a refusal",
    /establish how the earlier owner stopped owning/.test(S.assess(direct({})).action), true);

  /* ---------------------------------------------------------------- A-5 ---- */
  /* FA 2012 Sch 10 para 13, on the PAST OWNER's cessation date. */

  check("A-5 — corporation tax commencement is 1 April 2012",
    S.commencementDate({ claimant_type: "company" }).toISOString().slice(0, 10), "2012-04-01");
  check("A-5 — income tax commencement is 6 April 2012",
    S.commencementDate({ claimant_type: "sole_trader" }).toISOString().slice(0, 10), "2012-04-06");

  check("A-5 — para 13(1): a past owner gone before commencement takes s.187A off",
    S.regimeOff({ claimant_type: "company", past_owner_cessation_date: "2011-06-01" }), true);
  check("A-5 — para 13(1): a past owner gone after it does not",
    S.regimeOff({ claimant_type: "company", past_owner_cessation_date: "2013-06-01" }), false);
  check("A-5 TRAP — para 13(1) does NOT fire on an unknown cessation date",
    S.regimeOff({ claimant_type: "company" }), false);
  check("A-5 — the CT/IT split is real: 3 April 2012 is before commencement for a company",
    S.regimeOff({ claimant_type: "company", past_owner_cessation_date: "2012-04-03" }), false);
  check("A-5 — …and before it for an individual, whose clock starts three days later",
    S.regimeOff({ claimant_type: "sole_trader", past_owner_cessation_date: "2012-04-03" }), true);

  check("A-5 — para 13(2): pooling not required where the past owner went inside two years of commencement",
    S.poolingRequirementInForce({ claimant_type: "company", past_owner_cessation_date: "2013-06-01" }), false);
  check("A-5 — para 13(2): pooling required where they went later",
    S.poolingRequirementInForce({ claimant_type: "company", past_owner_cessation_date: "2020-06-01" }), true);
  check("A-5 TRAP — para 13(2) does NOT switch pooling off on an unknown cessation date",
    S.poolingRequirementInForce({ claimant_type: "company" }), true);

  check("A-5 — para 13(1) reaches the outcome: s.187A is off altogether",
    S.assess(direct({ past_owner_disposal_mode: "sold_market",
                      past_owner_cessation_date: "2011-06-01" })).outcome, "OFF");
  check("A-5 — and the report is told s.185 can still bite, so 'off' is not read as 'free'",
    /s\.185/.test(S.assess(direct({ past_owner_disposal_mode: "sold_market",
                      past_owner_cessation_date: "2011-06-01" })).action), true);
  check("A-F1 — nobody in the chain was ever entitled → s.187A off",
    S.assess({ __now: NOW, prior_owner_entitled: "no", earlier_entitled_owner: "no" }).outcome, "OFF");

  /* ---------------------------------------------------------------- A-1 ---- */
  /* The start date. This is the over-claim the phase exists for. */

  check("A-1 — an entitled seller means no one is in between",
    S.interveningOwner({ prior_owner_entitled: "yes" }), "no");
  check("A-1 — a non-entitled seller in front of an entitled owner IS an intervening owner",
    S.interveningOwner({ prior_owner_entitled: "no", earlier_entitled_owner: "yes" }), "yes");
  check("A-1 TRAP — an unknown seller position is 'unsure', which is not 'no'",
    S.interveningOwner({ prior_owner_entitled: "unsure" }), "unsure");
  check("A-1 — an explicit client answer overrides the derivation",
    S.interveningOwner({ prior_owner_entitled: "yes", intervening_owner: "yes" }), "yes");

  check("A-1 — direct purchase: the clock runs from the client's own completion",
    S.windowStart(direct({ past_owner_disposal_mode: "sold_market" })).basis, "client_acquisition");
  check("A-1 — chained purchase: the clock runs from the intervening purchase",
    S.windowStart(chained({ past_owner_disposal_mode: "sold_market" })).basis, "intervening_acquisition");

  /* THE DEFECT, stated as one comparison: same client, same completion date,
     opposite answers — which is exactly what the shipped question could not
     distinguish, because it only ever asked about the client's own date. */
  const sameDate = { past_owner_disposal_mode: "sold_market", acquisition_date: "2026-01-01" };
  check("A-1 DEFECT — bought direct in Jan 2026: the window is open",
    S.fvrWindow(direct(sameDate)).open, true);
  check("A-1 DEFECT — same client, same date, one owner in between: NOT reported open",
    S.fvrWindow(chained(sameDate)).open !== true, true);
  check("A-1 DEFECT — with the in-between purchase dated 2015 the window is positively closed",
    S.fvrWindow(chained(Object.assign({}, sameDate,
      { intervening_owner_acquisition_date: "2015-01-01" }))).open, false);

  check("A-1 TRAP — an unknown intervening purchase date gives 'not derivable', not 'open'",
    S.fvrWindow(chained(sameDate)).open, null);
  check("A-1 TRAP — and that reaches the client as INDET, never as a LIVE opportunity",
    S.assess(chained(sameDate)).outcome, "INDET");
  check("A-1 — the capture step names the title register rather than asking the client to guess",
    /title register/i.test(S.assess(chained(sameDate)).action), true);

  check("A-1 — item 5 runs from the grant of the lease, not from any purchase",
    S.windowStart(direct({ past_owner_disposal_mode: "new_lease_premium",
      past_owner_s183_election: "yes", past_owner_lease_grant_date: "2019-03-01" })).basis, "lease_grant");
  check("A-1 — and that lease date, not the client's 2026 completion, decides the window",
    S.fvrWindow(direct({ past_owner_disposal_mode: "new_lease_premium",
      past_owner_s183_election: "yes", past_owner_lease_grant_date: "2019-03-01" })).open, false);

  check("A-1 — a window open on the right date is reported LIVE",
    S.assess(direct(sameDate)).outcome, "LIVE");
  check("A-1 — a closed window is INDET, NOT nil: s.187A(6)(b) is A-2 and is not built",
    S.assess(direct({ past_owner_disposal_mode: "sold_market",
                      acquisition_date: "2015-01-01" })).outcome, "INDET");
  /* PHASE 53 correction. This asserted the board id was in `action`, which is
     the string rendered to the CLIENT in the "Why a specialist needs to look"
     panel. The handoff still has to be traceable, so it moved to `ref`, and
     the assertion moved with it — plus its mirror, which is the one that
     matters: the client-facing string must NOT carry it. */
  check("A-1 — the closed-window handoff still names A-2, in the INTERNAL ref field",
    /12921346993/.test(S.assess(direct({ past_owner_disposal_mode: "sold_market",
                      acquisition_date: "2015-01-01" })).ref), true);
  check("A-1 — and the CLIENT-FACING text does not carry a board item number",
    /12921346993|board item/i.test(S.assess(direct({ past_owner_disposal_mode: "sold_market",
                      acquisition_date: "2015-01-01" })).action), false);

  /* the F4 limb, and its A-1 guard */
  const SIX_L = ["amount", "plant", "land", "interest", "utrs", "both"];
  const withElection = extra => Object.assign({
    election_document: "held", election_content: SIX_L, election_value: 300000,
    election_notified_date: "2026-02-01", transaction_type: "sale",
    election_multi_property: "no", election_scope: "all_fixtures"
  }, extra || {});

  check("A-F12 — a valid in-time election on a direct purchase satisfies the requirement",
    S.assess(direct(withElection(sameDate))).outcome, "SATISFIED");
  check("A-1 GUARD — the same election does NOT settle it where someone sits in between",
    S.assess(chained(withElection(sameDate))).outcome, "INDET");
  check("A-F12 — 'satisfied' does not re-cap the range; Module C already did",
    S.applyOutcome(S.assess(direct(withElection(sameDate))), 100, 300000, [], null), [100, 300000]);

  /* ---------------------------------------------------------------- A-4 ---- */
  /* The disposal value statement requirement. The branch that did not exist. */

  const dvs = extra => direct(Object.assign({
    past_owner_disposal_mode: "sold_undervalue",
    past_owner_cessation_date: "2020-01-01"
  }, extra || {}));

  check("A-4 — the statement track is reached at all, which it previously was not",
    S.assess(dvs({})).track, "DVS");

  check("A-F23 — statement made in time and held → capped at the stated value",
    S.dvsAssess(dvs({ dvs_statement: "held", dvs_statement_date: "2021-06-01",
                      dvs_stated_value: 120000 })).outcome, "CAP-DV");
  check("A-F24 NIL — no statement was ever made → nil, not a figure",
    S.dvsAssess(dvs({ dvs_statement: "no" })).outcome, "NIL");
  check("A-F24 NIL — a statement made more than two years after cessation → nil",
    S.dvsAssess(dvs({ dvs_statement: "held", dvs_statement_date: "2023-06-01",
                      dvs_stated_value: 120000 })).outcome, "NIL");
  check("A-F25 — the two years run from CEASING TO OWN, so 2022-12-31 is still in time",
    S.dvsAssess(dvs({ dvs_statement: "held", dvs_statement_date: "2021-12-31",
                      dvs_stated_value: 120000 })).outcome, "CAP-DV");

  check("A-4 TRAP — held but cessation date unknown → INDET, not treated as in time",
    S.dvsAssess({ dvs_statement: "held", dvs_statement_date: "2021-06-01",
                  dvs_stated_value: 120000 }).outcome, "INDET");
  check("A-4 TRAP — held but undated → INDET, not treated as in time",
    S.dvsAssess(dvs({ dvs_statement: "held", dvs_stated_value: 120000 })).outcome, "INDET");
  check("A-4 TRAP — in time but no figure captured → INDET, not an uncapped figure",
    S.dvsAssess(dvs({ dvs_statement: "held", dvs_statement_date: "2021-06-01" })).outcome, "INDET");
  check("A-F30 — believed to exist but not produced → INDET (the burden is the client's)",
    S.dvsAssess(dvs({ dvs_statement: "exists_not_held" })).outcome, "INDET");
  check("A-F30 — 'not sure' is INDET too, and is not the same answer as 'no'",
    S.dvsAssess(dvs({ dvs_statement: "unsure" })).outcome !==
    S.dvsAssess(dvs({ dvs_statement: "no" })).outcome, true);

  /* the arithmetic, which is where over-claim actually happens */
  check("A-4 NIL is a real nil at both ends of the range",
    S.applyOutcome(S.assess(dvs({ dvs_statement: "no" })), 100000, 400000, [], null), [0, 0]);
  /* A cap is a ceiling, not a target. Where the survey range already sits
     below the stated disposal value the floor stays where it is — the
     statement does not become evidence that there IS that much plant. Same
     convention as CB_ELECTION.scopedCap. */
  check("A-4 CAP-DV brings the ceiling down to the stated value",
    S.applyOutcome(S.assess(dvs({ dvs_statement: "held", dvs_statement_date: "2021-06-01",
      dvs_stated_value: 120000 })), 100000, 400000, [], null), [100000, 120000]);
  check("A-4 CAP-DV does not RAISE a floor that is already below the stated value",
    S.applyOutcome(S.assess(dvs({ dvs_statement: "held", dvs_statement_date: "2021-06-01",
      dvs_stated_value: 120000 })), 10000, 20000, [], null), [10000, 20000]);
  check("A-4 INDET drops the floor to nil and leaves the ceiling",
    S.applyOutcome(S.assess(dvs({ dvs_statement: "unsure" })), 100000, 400000, [], null), [0, 400000]);
  check("A-F1/OFF leaves the range alone — s.187A off is not a cap",
    S.applyOutcome(S.assess({ __now: NOW, prior_owner_entitled: "no",
      earlier_entitled_owner: "no" }), 100000, 400000, [], null), [100000, 400000]);

  /* -------------------------------------------------- through the engine ---- */
  /* Unit results are worth little if the shipped flows never reach them. */

  function liveState(extra) {
    return Object.assign({
      sector: "care_homes", trigger: ["purchase"], deal: "property",
      base_amount: 2000000, claimant_type: "company", activity: "trade",
      dwelling_setting: "institution_commercial", acuity: "normal",
      flags: [], assumptions: [], lrr: false, return_in_time: false,
      __now: NOW
    }, extra || {});
  }
  function liveRun(extra) {
    const s = liveState(extra);
    return { r: ENGINES.care_homes.runEngine(s), s: s };
  }

  const liveNil = liveRun({
    prior_owner_claimed: "yes", prior_owner_entitled: "yes",
    past_owner_disposal_mode: "sold_undervalue",
    past_owner_cessation_date: "2020-01-01", dvs_statement: "no"
  });
  check("A-4 LIVE — the undervalue case now returns nil through the shipped engine",
    liveNil.r.QE, [0, 0]);
  check("A-4 LIVE — and the report names which requirement failed",
    liveNil.s.flags.some(f => /s\.187A\(3\)\(c\) NIL/.test(f)), true);

  const liveIndet = liveRun({
    prior_owner_claimed: "yes", prior_owner_entitled: "yes"
  });
  check("A-6 LIVE — an unestablished disposal floors the range at nil",
    liveIndet.r.QE[0], 0);
  check("A-6 LIVE — but does not zero the ceiling, because nothing is proved either way",
    liveIndet.r.QE[1] > 0, true);

  const liveChained = liveRun({
    prior_owner_claimed: "yes", prior_owner_entitled: "no", earlier_entitled_owner: "yes",
    past_owner_disposal_mode: "sold_market", acquisition_date: "2026-01-01"
  });
  check("A-1 LIVE — an intervening owner leaves the position unproven rather than open",
    liveChained.s.flags.some(f => /s\.187A POSITION UNPROVEN/.test(f)), true);
  check("A-1 LIVE — and the reason given is the other owner's purchase date, not the client's",
    liveChained.s.flags.some(f => /someone else owned the property between/.test(f)), true);
  check("A-1 LIVE — the floor drops to nil while that is unresolved",
    liveChained.r.QE[0], 0);
  check("A-1 LIVE — and no live window is asserted on someone else's transaction",
    liveChained.s.flags.some(f => /LIVE OPPORTUNITY \(s\.187A\(7\)\)/.test(f)), false);

  /* The shipped fixed-value question is the one A-1 is actually about. Its
     "shut for good" flag is a definitive statement built on the client's own
     completion date, and with an owner in between that is the wrong date. It
     must survive on a direct purchase — where it is still right — and must not
     fire where it is not. Nothing else reads fvr_window_closed, so these flags
     are the whole of that question's behaviour. */
  function fvrFlags(extra) {
    const q = (ENGINES.care_homes.Q || []).find(x => x.id === "Q14fvr");
    const s = Object.assign({ flags: [] }, extra);
    q.onSet(s, "yes");
    return s;
  }
  check("A-1 — on a direct purchase the original 'shut for good' finding still stands",
    fvrFlags({ prior_owner_entitled: "yes" }).flags.some(f => /shut for good/.test(f)), true);
  check("A-1 DEFECT — with an owner in between it must NOT be declared shut on the client's date",
    fvrFlags({ prior_owner_entitled: "no", earlier_entitled_owner: "yes" })
      .flags.some(f => /shut for good/.test(f)), false);
  check("A-1 — and that case is replaced by a capture step, not left silent",
    fvrFlags({ prior_owner_entitled: "no", earlier_entitled_owner: "yes" })
      .flags.some(f => /settles nothing either way/.test(f)), true);
  check("A-1 — the client's answer is discarded rather than kept as if decisive",
    fvrFlags({ prior_owner_entitled: "no", earlier_entitled_owner: "yes" }).fvr_window_closed, null);
  check("A-1 TRAP — an unknown seller position is treated like an intervening owner, not like a direct buy",
    fvrFlags({ prior_owner_entitled: "unsure" }).flags.some(f => /shut for good/.test(f)), false);

  /* ------------------------------------------------ the questions shipped --- */

  const NEW_IDS = ["14po", "14pol", "14pold", "14pod", "14iv", "14ivd", "14dvs", "14dvsd", "14dvsv"];
  const PREFIX = { care_homes: "Q", dental: "D", supported_living: "S", gp: "G", private_hospital: "H" };

  SECTORS.forEach(sec => {
    const ids = (ENGINES[sec].Q || []).map(q => q.id);
    const missing = NEW_IDS.filter(sfx => ids.indexOf(PREFIX[sec] + sfx) < 0);
    check("all four fixes reach the " + sec + " flow", missing, []);
  });

  /* Every new question must be answerable by someone who has never read the
     Act. The classification is derived; if a future edit puts the statute back
     into the question text, that is the defect returning and this fails. */
  const JARGON = /s\.1[0-9]{2}|s\.6[12]|section 1[0-9]{2}|Table item|item [0-9] of|subsection|qualifying interest|disposal value statement requirement|fixed value requirement|apportionment|Sch 10|FA 2012/i;
  const offending = [];
  SECTORS.forEach(sec => {
    (ENGINES[sec].Q || []).forEach(q => {
      if (NEW_IDS.indexOf(String(q.id).replace(/^[QDSGH]/, "")) < 0) return;
      if (JARGON.test(q.ask || "")) offending.push(sec + ":" + q.id);
    });
  });
  check("every new question is put in lay terms — no statutory reference in any 'ask'",
    offending, []);

  const allNew = [];
  SECTORS.forEach(sec => (ENGINES[sec].Q || []).forEach(q => {
    if (NEW_IDS.indexOf(String(q.id).replace(/^[QDSGH]/, "")) >= 0) allNew.push(q);
  }));
  check("all 45 new questions are present across the five flows", allNew.length, 45);
  check("every new question carries help text, not just a prompt",
    allNew.filter(q => !q.help || q.help.length < 40).map(q => q.id), []);
  check("every new question is gated — none is asked of every client",
    allNew.filter(q => typeof q.showIf !== "function").map(q => q.id), []);
  check("the disposal question offers an explicit 'not sure' rather than forcing a guess",
    allNew.filter(q => /14po$/.test(q.id))
          .every(q => q.opts.some(o => o[0] === "unsure")), true);
}


/* =====================================================================
   M. PHASE 53 — THE HANDOVER INVARIANTS

   These are not engine assertions. They guard the things a developer
   would have to be TOLD, and that would rot silently if nobody checked:
   the brand name, the honesty qualifier on it, the absence of a payment
   processor, and — the one that caught a real defect on 31 August 2026 —
   internal references leaking into client-facing copy.

   The leak that prompted M1: the s.187A closed-window handoff put
   "board item 12921346993" into `action`, which renders to the client in
   the "Why a specialist needs to look" panel. One string was doing two
   jobs for two audiences. The internal half now lives in `ref`.
   ===================================================================== */
if (startSuite("M", "Phase 53 — handover invariants")) {

  /* --- M1: no internal reference in a client-facing string ------------- */

  const STRLIT = new RegExp('"(?:[^"\\\\]|\\\\.)*"' + "|'(?:[^'\\\\]|\\\\.)*'", "g");

  function nonCommentStringLiterals(text) {
    const out = [];
    let inBlock = false;
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!inBlock && t.startsWith("/*")) inBlock = true;
      if (inBlock) { if (t.indexOf("*/") >= 0) inBlock = false; continue; }
      if (t.startsWith("//") || t.startsWith("*")) continue;
      /* A literal assigned to `ref` is the INTERNAL half of the split and is
         never rendered. Excluding it here is the whole reason the field
         exists; excluding anything else would be muting the check. */
      if (/(^|[^A-Za-z])refs*:/.test(t)) continue;
      const m = line.match(STRLIT);
      if (m) out.push.apply(out, m);
    }
    return out;
  }

  const siteStrings = nonCommentStringLiterals(src);

  check("M1 — no client-facing string carries a Monday board item number",
    siteStrings.filter(s => /board item\s*\d/i.test(s)).map(s => s.slice(0, 90)), []);

  /* `ref` is the field built to carry it, and it must still be carrying it —
     otherwise M1 could be satisfied by deleting the traceability instead of
     relocating it, which would be strictly worse than the defect. */
  check("M1 — and the internal ref field still exists to carry it",
    /ref:"A-2, switch CB_CTA\.s187a_6b_statements_route/.test(src), true);

  /* --- M2: the name, and the honesty qualifier on it (Phase 49, Q49) --- */

  /* AMENDED PHASE 71, 3 September 2026 — THE TRADING NAME IS NOW CAPREBATE.

     This is the SECOND rename. "Caprebate" was itself adopted on
     1 September after a live brand collision was found on the previous name,
     so both earlier names are now legacy and neither may appear on the page.

     THE FOUR BUCKETS, AND WHICH HAVE MOVED:
       · client-facing copy      — MOVED to Caprebate (this assertion)
       · the file on the Desktop — MOVED to "Caprebate site.html"
       · code identifiers        — MOVED, 4 September 2026 (Phase 78). Every
                                   LS_ prefix is now CB_, 58 files were renamed
                                   and the junctions repointed. The check below
                                   is still against `src` (the page) rather
                                   than the repo, because the page is the thing
                                   a client reads and it is the assertion that
                                   would matter if only one survived.
       · the domain              — MOVED, 24 September 2026 (Phase 151),
                                   to caprebate.co.uk, where the three IONOS
                                   mailboxes are. See M2b. */
  check("M2 — the site carries no legacy brand name",
    (src.match(/Ledgerstone|Health Tax Partners/g) || []).length, 0);

  /* AMENDED PHASE 133d, 17 September 2026 — THE NAME A VISITOR READS IS NOW
     "CAP REBATE", two words, as the brand book (v1.0, slide 1) spells it. Until
     today this asserted /Caprebate/ anywhere in `src`, which a code comment
     alone would have satisfied. It now asserts the two-word name in the page
     AND that no client-facing string literal still carries the one-word form.
     Code identifiers (CB_ names), the file name and the domain are unchanged,
     and the not-yet-incorporated qualifier below is unchanged: Lakhbir decided
     on 17 September 2026 that the page names "Cap Rebate" with no "Ltd" and no
     company number until the legal entity is settled. Still ONE check, so the
     suite's count does not move. */
  check("M2 — the site names Cap Rebate, and no client-facing string says Caprebate",
    /Cap Rebate/.test(src) && siteStrings.filter(s => /Caprebate/.test(s)).length === 0, true);

  /* M2b — REPLACED 3 September 2026 (Phase 76 sweep), as its own comment
     instructed. The assertion above held the footer on the .com domain
     "until the domain decision is taken". THE DOMAIN DECISION IS NOW TAKEN:
     Lakhbir answered the trading-name question on 3 September ("look at
     everything to do with the business and change it to Caprebate"), and the
     domain was verified INDEPENDENTLY BY DNS on the same day rather than
     inherited from the earlier check — caprebate.co.uk and caprebate.com both
     resolve to 217.160.0.189, both carry MX to mx00/mx01.ionos.co.uk, both
     carry an IONOS SPF record, and both sit on ui-dns nameservers. So the page
     no longer advertises an address on a domain that is not ours.

     The replacement asserts the mismatch is GONE in both directions: no legacy
     domain on the page, and the contact address is on the domain the brand
     actually owns. It does NOT assert the mailbox is provisioned — that is
     item 12927507563 and is still open. */
  check("M2b — no legacy domain survives in the client-facing page",
    /healthtaxpartners\.(?:com|co\.uk)/.test(src), false);

  /* AMENDED PHASE 151, 24 September 2026. The business is on caprebate.co.uk,
     not caprebate.com (Word answers 3, 13, 186 and 211), and its contact
     mailbox, contact@caprebate.co.uk, exists on IONOS. Still ONE check, so the
     suite's count does not move: the page shows the .co.uk address and carries
     no caprebate.com anywhere. */
  check("M2b — the contact address is on the decided domain",
    /contact@caprebate\.co\.uk/.test(src) && !/caprebate\.com/.test(src), true);

  /* ADDED PHASE 153, 28 September 2026. Both thank-you screens printed "Email: [ PLACEHOLDER ]" after the
     mailbox was live and read (Word questions 3 and 216). Fails on any site file before this phase. */
  check("M2c — the thank-you screens print the live contact address, not a placeholder",
    !/\[ PLACEHOLDER \]/.test(src) && (src.match(/<strong>Email:<\/strong> <a href=\"mailto:contact@caprebate\.co\.uk\">/g) || []).length === 2, true);

  /* Q49 was ANSWERED by Lakhbir on 1 Sep 2026 — "just say Health Tax
     Partners", incorporating this week — so Phase 62 removed the clearance
     qualifier from the site and the sample report. The qualifier was TRUE on
     the day it came out, which means the page is briefly ahead of the facts
     until incorporation lands. That is an accepted, recorded risk, and board
     item 12937561331 raises it again if incorporation slips past 8 Sep 2026.
     The assertion below is REPLACED, not deleted: the page must not carry the
     old qualifier, and must not swing the other way and assert a registration
     that has not happened.

     REVERSED 3 September 2026 (Phase 76 sweep). THE PREMISE HAS BEEN
     WITHDRAWN BY THE PERSON WHO GAVE IT. Lakhbir's answer of 3 September to
     "will you incorporate this week" is: "this will be done at a later date
     once everything else is done." So the page is not briefly ahead of the
     facts pending a date — it is ahead of them indefinitely, and the 8
     September raise date on 12937561331 has nothing left to fire on. The name
     on the page also changed on the same day: "Caprebate" was adopted on 3
     September and has been cleared at neither Companies House nor by
     trade-mark search either, so the qualifier now covers a name that is two
     days old rather than one that was two days from being registered.

     The qualifier is therefore RESTORED, and this assertion is inverted to
     hold it there. This is a deliberate harness change with a recorded
     reason, not a mute. It reverts when incorporation actually happens - REVERTED 18 Sep 2026 (Phase 133g): CAP REBATE LTD, 17307313, is ours. */
  check("M2 — the site names the company as registered: CAP REBATE LTD, 17307313, England and Wales, its registered office",
    /Cap Rebate is a trading name of CAP REBATE LTD<\/strong>, a company registered in England and Wales, company number 17307313, registered office 1st Floor, 1-9 Castle Street, Hinckley, LE10 1DA\./.test(src), true);

  check("M2 — and the trading name is still said to be uncleared by a trade-mark search, and nothing says the company is not incorporated",
    /not been cleared by a trade-mark search/.test(src) && !/not yet incorporated/.test(src), true);

  check("M2 — and the site names no other company, and no company number but 17307313",
    /Cap Rebate (?:Ltd|Limited)|CAP REBATE LIMITED|company (?:number|no\.?)\s+(?!17307313)[0-9A-Z]{6,8}\b|\b(?:0[0-9]{7}|SC[0-9]{6})\b/i.test(src.replace(/CAP REBATE LTD/g, "")), false);

  /* --- M3: no payment processor (decided 29 Aug 2026) ------------------ */

  check("M3 — no payment processor is named anywhere in the client journey",
    (src.match(/Stripe|GoCardless/g) || []), []);

  /* --- M4: the handover package exists and has not drifted ------------- */

  const ROOT = path.join(DIR, "..");
  const HANDOVER = [
    /* ARCHIVED BY PHASE 108, 9 September 2026, and the entry MOVED rather than
       disappeared — exactly as Phase 104 did with the journey wireframe, and
       for the same reason. The brief is superseded by the Developer Spec below,
       but it is still the only record of the brief AS WRITTEN, the two content
       assertions further down are assertions ABOUT THAT DOCUMENT, and the
       handover pack on board item 12937209644 ships it. M4 still requires it on
       disk, at its new path. */
    ["Developer Brief (archived by Phase 108)", "_archive/superseded/Caprebate-Developer-Brief.md"],
    ["the Developer Spec that replaced it", "09-app/CAPREBATE-DEVELOPER-SPEC.md"],
    ["build spec v2", "02-modules-and-build-prep/Build-Prep-06-Developer-Build-Specification-v2.md"],
    ["decided/not-decided note", "06-commercial-and-governance/Caprebate-Decided-And-Not-Decided-v1.md"],
    /* SUPERSEDED BY PHASE 104, 8 September 2026, and this is why the entry
       changed rather than disappearing. The wireframe was the developer's
       picture of screens that did not exist; the screens exist now, so a
       handover that still shipped the drawing instead of the application would
       be handing over the wrong artefact. It is ARCHIVED, not deleted — M4
       still requires it on disk, at its new path, because it is the only
       record of the screen sequence as it was first drawn. */
    ["journey wireframe (archived by Phase 104)", "_archive/superseded/caprebate-journey-wireframe.html"],
    ["the application that replaced it", "09-app/backend/src/web/router.ts"],
    ["CTA switch table", "01-rulebooks/Caprebate-Phase-51-CTA-Switch-Table-v1.md"],
    ["upload handler", "04-phase-work/phase3/caprebate-upload-handler.ts"],
  ];
  check("M4 — every document in the developer handover pack is on disk",
    HANDOVER.filter(h => !fs.existsSync(path.join(ROOT, h[1]))).map(h => h[0]), []);

  /* BY NAME, NOT BY INDEX. These two reads used HANDOVER[0] and HANDOVER[5],
     so inserting an entry above them silently pointed each at a different
     document — which is exactly what happened when Phase 104 archived the
     journey wireframe and added the application that replaced it: M4 went
     green and M5 started failing against a file that was never the handler. */
  const handoverPath = (label) => {
    const row = HANDOVER.filter(h => h[0].indexOf(label) === 0)[0];
    if (!row) throw new Error("no handover entry starting '" + label + "'");
    return path.join(ROOT, row[1]);
  };

  const brief = fs.readFileSync(handoverPath("Developer Brief"), "utf8");
  check("M4 — the Developer Brief carries the section that overrides its own stack table",
    /### 3\.0 READ THIS BEFORE THE TABLE/.test(brief), true);
  check("M4 — and the three WordPress control questions are named in it",
    ["Q51", "Q52", "Q53"].filter(q => brief.indexOf(q) < 0), []);

  /* --- M4a: the spec that replaced it says what it is NOT, and lists its own
     stubs. Added by Phase 108. These are deliberately assertions about the
     PRESENCE OF THE HONESTY, not about wording: a spec that lost the "what this
     is not" paragraph, or lost the stub table, would be a spec a developer
     could deploy on a public address in good faith. */
  const spec = fs.readFileSync(handoverPath("the Developer Spec"), "utf8");
  check("M4a — the spec opens by saying what it is not",
    /## WHAT THIS IS NOT/.test(spec), true);
  /* WHITESPACE-TOLERANT ON PURPOSE. The spec is hand-wrapped prose and this
     sentence spans a line break; an assertion that could be broken by a
     re-wrap would be a false alarm waiting to happen. It caught this on its
     first run, which is also the proof it can fail. */
  check("M4a — and it says the invented data must not be deployed publicly",
    /must not be deployed on a public\s+address/.test(spec), true);
  check("M4a — it carries the four non-negotiables, each by name",
    ["N1 · The anchor quarantine", "N2 · The name exclusion register",
     "N3 · RECEIPT_CONTRACT", "N4 · Unknown never routes to the favourable branch"]
      .filter(n => spec.indexOf(n) < 0), []);
  check("M4a — and a stub table naming every stub's file",
    ["src/stubs/email.ts", "src/stubs/signature.ts", "src/stubs/registers.ts",
     "src/web/uploads.ts"].filter(f => spec.indexOf(f) < 0), []);

  /* THE ONE THAT CATCHES THE FAILURE THIS DOCUMENT EXISTS TO PREVENT.
     src/app.ts holds the machine-readable stub list served at /api/health. Every
     module named there must be named in the spec's table, or the spec is a
     shorter list than the code's and a reader would trust the shorter one.
     Phase 108 found exactly that: the text extractor was a stub in prose, in
     neither list. */
  const appTs = fs.readFileSync(path.join(ROOT, "09-app/backend/src/app.ts"), "utf8");
  const stubModules = (appTs.slice(appTs.indexOf("export const STUBS"))
    .match(/module: '([^']+)'/g) || []).map(m => m.slice(10, -1));
  check("M4a — every module in the code's own STUBS list appears in the spec's stub table",
    stubModules.filter(m => spec.indexOf(m) < 0), []);
  check("M4a — and the code's STUBS list is not empty, so the check above can fail",
    stubModules.length > 0, true);

  /* --- M5: the upload handler covers the whole receipt contract -------- */

  const handler = fs.readFileSync(handoverPath("upload handler"), "utf8");
  const ingestion = fs.readFileSync(
    path.join(ROOT, "04-phase-work/phase3/caprebate-client-doc-ingestion.ts"), "utf8");

  const contractBlock = ingestion.slice(ingestion.indexOf("export const RECEIPT_CONTRACT"));
  const contractSteps = (contractBlock.slice(0, contractBlock.indexOf("];"))
    .match(/^\s*'\d+\./gm) || []).length;
  const coverageSteps = ((handler.slice(handler.indexOf("export const CONTRACT_COVERAGE"))
    .match(/\{ step: \d+,/g)) || []).length;

  check("M5 — the handler claims exactly as many steps as RECEIPT_CONTRACT states",
    coverageSteps, contractSteps);
  check("M5 — and the contract is still twelve steps",
    contractSteps, 12);

  /* The wiring assertion. RECEIPT_CONTRACT existed for six days with no
     caller and every control on client documents was dormant. That must
     never be true again without something failing. */
  check("M5 — the handler actually calls the module's assertions, not just imports them",
    ["assertQuarantineKey", "applyReceiptPolicy", "recordQuarantineDischarge",
     "assertQuarantineDischarged", "assertClaimsWritable",
     "assertTransparencyRecordComplete"].filter(fn => {
       const uses = (handler.match(new RegExp("\\b" + fn + "\\s*\\(", "g")) || []).length;
       return uses === 0;
     }), []);
}


/* ---------------------------------------------------------------------------
   N. Phase 64 — jurisdiction. Board item 12878920167.

   Three defects, three groups of assertions:
     N1-N4  every sector asks the nation, of every claimant
     N5-N9  the served set is one place and the copy is derived from it
     N10-N14 what a nation cannot derive is stated, not discovered
   --------------------------------------------------------------------------- */
if (startSuite("N", "Phase 64 — jurisdiction: coverage, sourcing and rates")) {

  /* ---- the defect that was live: two sectors read is_scotland, never set it */

  const NATION_Q = { care_homes:"Q1a", dental:"D1n", supported_living:"S1n",
                     gp:"G1b", private_hospital:"H1b" };

  check("N1 — every sector has a nation question",
    SECTORS.filter(s => {
      const Q = ENGINES[s] && ENGINES[s].Q;
      return !Q || !Q.some(q => q && q.id === NATION_Q[s]);
    }), []);

  /* The original bug in one assertion: a sector may not READ s.is_scotland at
     its rateKey line unless some question in that sector SETS it. */
  check("N2 — no sector reads is_scotland without a question that sets it",
    SECTORS.filter(sec => {
      const marker = "/* ===== " + sec + " ===== */";
      const start = src.indexOf(marker);
      const end = src.indexOf("/* ===== ", start + marker.length);
      const body = src.slice(start, end < 0 ? src.length : end);
      const reads = body.indexOf("s.is_scotland") !== -1;
      const Q = ENGINES[sec] && ENGINES[sec].Q;
      const asks = !!(Q && Q.some(q => q && q.id === NATION_Q[sec]));
      return reads && !asks;
    }), []);

  /* Nation is a SOURCING question, so it cannot be hidden from companies.
     This is the showIf that used to be there. */
  check("N3 — the nation question is asked of every claimant, companies included",
    SECTORS.filter(sec => {
      const q = (ENGINES[sec].Q || []).find(q => q && q.id === NATION_Q[sec]);
      return !q || (typeof q.showIf === "function" &&
                    !q.showIf({ claimant_type:"company", trigger:[] }));
    }), []);

  check("N4 — every sector offers all four nations, not a Scotland/rest binary",
    SECTORS.filter(sec => {
      const q = (ENGINES[sec].Q || []).find(q => q && q.id === NATION_Q[sec]);
      const codes = q && q.opts ? q.opts.map(o => o[0]).sort() : [];
      return JSON.stringify(codes) !== JSON.stringify(["england","ni","scotland","wales"]);
    }), []);

  /* ---- the served set is one place ---- */

  check("N5 — the served set is England and Wales",
    Object.keys(CB_JURIS.SERVED).filter(k => CB_JURIS.SERVED[k]).sort(),
    ["england", "wales"]);

  check("N6 — the site's coverage sentence is derived from the served set, not typed",
    CB_JURIS.servedPhrase(), "England and Wales");

  /* The published copy must not be able to drift away from the flag. If the
     served set changes and the marketing page does not, this fails. */
  check("N7 — the published coverage line matches the served set",
    src.indexOf("currently set up for " + CB_JURIS.servedPhrase()) !== -1, true);

  check("N8 — an unserved nation is gated in every sector",
    SECTORS.filter(sec => {
      const q = (ENGINES[sec].Q || []).find(q => q && q.id === NATION_Q[sec]);
      const t = q && q.gate && q.gate({ nation:"scotland", assumptions:[] });
      return !t || t.type !== "ref";
    }), []);

  check("N9 — a served nation is not gated",
    SECTORS.filter(sec => {
      const q = (ENGINES[sec].Q || []).find(q => q && q.id === NATION_Q[sec]);
      return q.gate({ nation:"england", assumptions:[] }) !== null;
    }), []);

  /* ---- what a nation cannot derive ---- */

  check("N10 — HMLR price paid exists in England and Wales and nowhere else",
    ["england","wales","scotland","ni"].map(n => !!CB_JURIS.sources(n).price_paid),
    [true, true, false, false]);

  check("N11 — Scotland and NI have no purchase-price derivation, and say so",
    [CB_JURIS.missingDerivations("scotland").indexOf("purchase price and completion date") !== -1,
     CB_JURIS.missingDerivations("ni").indexOf("purchase price and completion date") !== -1],
    [true, true]);

  check("N12 — England derives everything it needs; Wales is thinner but not empty",
    [CB_JURIS.missingDerivations("england").length,
     CB_JURIS.missingDerivations("wales").length > 0],
    [0, true]);

  /* The transaction tax is an INPUT to the s.562 base, not something we
     compute — but asking a Scottish client about SDLT is asking about a tax
     that does not exist there. */
  check("N13 — the transaction tax named is the one that exists in that nation",
    ["england","wales","scotland","ni"].map(n => CB_JURIS.transactionTax(n)),
    ["SDLT", "LTT", "LBTT", "SDLT"]);

  /* A served nation that cannot derive something must record it as an
     assumption rather than let it pass silently. Wales is the live case. */
  (function(){
    const q = (ENGINES.care_homes.Q || []).find(q => q && q.id === "Q1a");
    const sW = { assumptions:[] }; q.onSet(sW, "wales");
    const sE = { assumptions:[] }; q.onSet(sE, "england");
    check("N14 — Wales records its sourcing gaps and its transaction tax as assumptions",
      [sW.assumptions.length > 0,
       sW.assumptions.join(" ").indexOf("LTT") !== -1,
       sE.assumptions.length],
      [true, true, 0]);
    check("N15 — the nation answer sets is_scotland for the rate table",
      [(function(){ const s={assumptions:[]}; q.onSet(s,"scotland"); return s.is_scotland; })(),
       sE.is_scotland],
      [true, false]);
  })();
}


/* =====================================================================
   O. PHASE 67 — THE CONDENSED FRONT DOOR AND THE DERIVATION LAYER

   Two journey documents named Companies House, HMLR, EPC and CQC 76 times
   between them and neither derived anything from any of them. This suite
   guards the layer that does, and — more importantly — guards the three
   corrections that stop the condensed front door losing valid claims.

   THE ASSERTION THAT MATTERS MOST IS O7. Two of the three corrections were
   already correct in the engine before this phase began: CB_S187A derives
   the April 2014 threshold rather than storing it, and it derives the
   two-year clock's start rather than assuming it. The risk was never that
   they were missing. The risk was that a new front door would reimplement
   them and get them wrong, in the half of the system nobody reads. O7 and
   O9 assert the delegation, not the answer.
   ===================================================================== */
if (startSuite("O", "Phase 67 — condensed front door, derivation layer")) {

  /* --- O1: built, and switched off ------------------------------------ */

  /* The layer depends on a lawful basis whose condition is unmet — a
     published privacy notice reachable at the point of collection. So it
     ships the way the ten adviser switches ship: branch built, branch
     tested, branch defaulting to today's behaviour. */
  check("O1 — the derivation layer is off",
    CB_REGISTRY.precondition.enabled, false);

  check("O1 — and it names the condition that is unmet",
    CB_REGISTRY.precondition.unmet.length > 0, true);

  (function(){
    const d = CB_REGISTRY.derive({ hmlr:{price_paid:450000, completion_date:"2019-06-01"} }, {nation:"england"});
    check("O1 — while it is off, a register value present in the bundle is still not used",
      [Object.keys(d.values).length, d.ask.indexOf("price_paid") !== -1],
      [0, true]);
  })();

  /* --- O2: N2, the name exclusion, classified by field NAME ----------- */

  /* AMENDED PHASE 132c, 15 September 2026. The two names are permitted, and
     since today only after a signed engagement (CA2), so this asks with the
     server's signed record. Without one they are NOT_PERMITTED_YET - asserted
     both ways, with every unknown, in suite AA. */
  check("O2 — the two permitted names are permitted, once an engagement is signed",
    [CB_REGISTRY.classifyField("hmlr","proprietor_name",{signed:true}).ok,
     CB_REGISTRY.classifyField("companies_house","psc_name",{signed:true}).ok],
    [true, true]);

  check("O2 — and every other personal field is refused",
    [CB_REGISTRY.classifyField("companies_house","director_name").code,
     CB_REGISTRY.classifyField("cqc","registered_manager_name").code,
     CB_REGISTRY.classifyField("epc","assessor_name").code],
    ["E_PERSONAL_FIELD_NOT_PERMITTED","E_PERSONAL_FIELD_NOT_PERMITTED","E_PERSONAL_FIELD_NOT_PERMITTED"]);

  /* The barrier that catches drift: a field nobody has classified is
     refused rather than waved through. This is the one that fires when a
     supplier adds a field to their response shape. */
  check("O2 — an uncatalogued field is refused, not waved through",
    CB_REGISTRY.classifyField("hmlr","vendor_solicitor_name").code,
    "E_UNCLASSIFIED_FIELD");

  check("O2 — and an unknown source is refused too",
    CB_REGISTRY.classifyField("experian","anything").code, "E_UNKNOWN_SOURCE");

  /* --- O3, O4: what the layer would do if it were on ------------------ */

  /* Asserted against derive() with the precondition temporarily raised —
     the switch is restored immediately. Without this the whole layer would
     be untested until somebody flips it in production, which is the worst
     possible moment to discover the jurisdiction check is missing. */
  function withLayerOn(fn){
    CB_REGISTRY.precondition.enabled = true;
    try { return fn(); } finally { CB_REGISTRY.precondition.enabled = false; }
  }

  withLayerOn(function(){
    const bundle = { hmlr:{price_paid:450000, completion_date:"2019-06-01", tenure:"freehold"},
                     epc:{floor_area_m2:268, construction_age_band:"1976-1982"},
                     cqc:{service_type:"Care home with nursing", bed_count:42},
                     companies_house:{entity_type:"limited company", year_end:"03-31"} };

    /* AMENDED PHASE 71, 3 September 2026. THIS TEST NOW CARRIES A SECTOR, AND
       IT HAS TO.

       HM Land Registry Price Paid Data holds RESIDENTIAL PROPERTY ONLY. It is
       free and needs no key, and it excludes commercial property entirely — so
       a care home, a dental practice, a GP surgery and a private hospital all
       return nothing from it. Supported living, being ordinary dwellings bought
       as ordinary dwellings, is the one sector where the free route works.

       The old form of this test passed a bundle with no sector and asserted the
       price derived. That asserted a condensation we do not actually have for
       four sectors out of five. */
    const e = CB_REGISTRY.derive(bundle, {nation:"england", sector:"supported_living"});
    check("O3 — for a residential sector in England the purchase price is derived, not asked",
      [e.values.price_paid, e.ask.indexOf("price_paid")],
      [450000, -1]);

    /* The half that matters commercially. Four of the five sectors land here. */
    const com = CB_REGISTRY.derive(bundle, {nation:"england", sector:"care_homes"});
    check("O3 — for a COMMERCIAL sector the same bundle derives no price and asks instead",
      [com.values.price_paid === undefined,
       com.ask.indexOf("price_paid") !== -1,
       com.notCovered.indexOf("price_paid") !== -1],
      [true, true, true]);

    /* And it must say WHY, distinguishably. Without this the log reads exactly
       like a register outage, and a permanent phantom outage is the kind of
       thing nobody investigates for six months. */
    check("O3 — and it says the source does not cover commercial, not that the register was empty",
      /residential property only/i.test(com.why.price_paid || ""), true);

    /* An unknown sector never assumes coverage. */
    const uns = CB_REGISTRY.derive(bundle, {nation:"england"});
    check("O3 — an unknown sector does not assume the source covers it",
      uns.ask.indexOf("price_paid") !== -1, true);

    /* Floor area is not residential-gated, so it survives the sector change —
       proving the check is targeted and not the layer failing wholesale. */
    check("O3 — a non-residential-gated field still derives for a commercial sector",
      com.values.floor_area_m2, 268);

    /* HMLR price paid exists in England and Wales and nowhere else. A
       Scottish client must get a QUESTION, not a wrong number. */
    const sc = CB_REGISTRY.derive(bundle, {nation:"scotland"});
    check("O3 — in Scotland the same bundle yields no purchase price and asks instead",
      [sc.values.price_paid === undefined, sc.ask.indexOf("price_paid") !== -1],
      [true, true]);

    /* Floor area is not jurisdictional, so it survives the nation change —
       proving O3 is a targeted check and not the layer failing wholesale. */
    check("O3 — and a non-jurisdictional field still derives in Scotland",
      sc.values.floor_area_m2, 268);

    check("O4 — the valuation office is licence-gated, so it asks",
      [e.gated.indexOf("rateable_value") === -1, e.values.rateable_value === undefined],
      [true, true]);

    /* --- O3a: THE LAND REGISTRY'S WORDS TRAVEL WITH THE SENTENCE ---------
       PHASE 146h, 23 September 2026.

       derive() writes "Our records show you paid {v} for this property" into
       provenance.price_paid.confirm. The records are HM Land Registry's Price
       Paid Data, whose Open Government Licence PRESCRIBES a credit and says it
       must appear verbatim — and until this phase the provenance carried none,
       so any screen that drew the sentence would have drawn it uncredited.
       Nothing draws it yet, which is why this is a correction and not a breach,
       and this check is what stops it becoming one.

       THE YEAR IS A FIXED 2021. It is the year HM Land Registry's own guidance
       prints whatever year you read it in, and a build that substituted the
       current year would publish a credit the licence does not prescribe. It
       has gone missing from this line once already.

       AND THE FIELD THAT MUST *NOT* CARRY IT. `tenure` is on the same source in
       this map, and at the address question it is answered by the title
       register rather than by Price Paid. A credit on a field that did not come
       from that dataset is a false statement of origin, which is worse than a
       missing one — so this asserts the absence as hard as the presence. */
    /* THE WORDS ARE WRITTEN OUT HERE, not read from the thing being tested. An assertion that compares the module
       to itself passes on a copy where both sides are undefined, which is exactly what a pre-change run proved. */
    const HMLR_WORDS =
      "Contains HM Land Registry data \u00a9 Crown copyright and database right 2021. " +
      "This data is licensed under the Open Government Licence v3.0.";

    check("O3a — the sentence about the price paid carries HM Land Registry's prescribed words, 2021 included",
      [e.provenance.price_paid.attribution, e.provenance.completion_date.attribution],
      [HMLR_WORDS, HMLR_WORDS]);

    check("O3a — and the layer names the words once, so the two fields cannot drift apart",
      CB_REGISTRY.HMLR_PPD_ATTRIBUTION, HMLR_WORDS);

    /* Asserted across EVERY field that derived, rather than against a list of names: a field added to the map
       tomorrow is covered the day it is added, and one that stops deriving cannot make this pass by vanishing. */
    check("O3a — the two Price Paid fields carry the credit and NO other derived field does",
      Object.keys(e.provenance).filter(function(f){ return e.provenance[f].attribution !== null; }).sort(),
      ["completion_date", "price_paid"]);

    check("O3a — and every other derived field says null rather than leaving the reader to guess",
      Object.keys(e.provenance).every(function(f){ return "attribution" in e.provenance[f]; }), true);

    check("O3a — the sentence itself is unchanged, and the words sit beside it rather than inside it",
      [e.provenance.price_paid.confirm.indexOf("Our records show you paid 450000") === 0,
       e.provenance.price_paid.confirm.indexOf("Crown copyright") === -1],
      [true, true]);

    /* A register that returns nothing costs a question, not an answer. */
    const thin = CB_REGISTRY.derive({ hmlr:{} }, {nation:"england"});
    check("O4 — an empty register response falls back to asking, never to a default",
      [thin.values.price_paid === undefined,
       thin.ask.indexOf("price_paid") !== -1,
       Object.keys(thin.values).length],
      [true, true, 0]);
  });

  /* --- O5: the sector is derived, and unknown does not pick one ------- */

  check("O5 — the regulator's service type selects the engine",
    ["Care home with nursing","Supported living service","Dental practice",
     "Doctors/GP practice","Acute hospital"].map(t => CB_REGISTRY.sectorFromServiceType(t).sector),
    ["care_homes","supported_living","dental","gp","private_hospital"]);

  /* The important half. Guessing the sector makes every answer after it the
     answer to a different question. */
  check("O5 — an unrecognised or absent service type asks rather than guessing",
    [CB_REGISTRY.sectorFromServiceType("Something else entirely").sector,
     CB_REGISTRY.sectorFromServiceType(null).sector,
     CB_REGISTRY.sectorFromServiceType(null).derivable],
    [null, null, false]);

  /* --- O6: CORRECTION 1 — the gate narrows to the client's own claim -- */

  /* AMENDED PHASE 71, 3 September 2026. THIS ASSERTION IS REVERSED BY DECISION.

     It previously read `.gated === true`. Phase 67 had narrowed the gate from
     "has anyone ever claimed" to "have YOU already claimed on these fixtures",
     which was right and did not go far enough. Two reasons it now gates on
     nothing: relief may still be available on renovation and later spend, which
     a stop discards; and WE DO NOT KNOW WHAT THE EARLIER CLAIM WAS FOR — "a
     claim" covers a repairs deduction, AIA on loose equipment, allowances on a
     van, and a genuine fixtures claim, and only the last would matter.

     What replaces the stop is a flag to the chartered tax adviser, scoped to the
     fixtures element, plus the offer of a call. */
  check("O6 — the client's own prior claim NO LONGER gates",
    CB_FRONTDOOR.gateQ1({own_prior_claim:"yes"}).gated, false);

  check("O6 — it raises a CTA flag instead, scoped to the fixtures element only",
    [CB_FRONTDOOR.gateQ1({own_prior_claim:"yes"}).flag,
     CB_FRONTDOOR.gateQ1({own_prior_claim:"yes"}).scope],
    ["CTA_REVIEW_PRIOR_CLAIM", "fixtures_only"]);

  /* "Not sure" flags too. It is the answer of somebody who genuinely does not
     know, which is most people, and it is worth a human either way. */
  check("O6 — 'not sure' flags for review as well, and offers a call",
    [CB_FRONTDOOR.gateQ1({own_prior_claim:"not sure"}).flag,
     CB_FRONTDOOR.gateQ1({own_prior_claim:"not sure"}).offerCall],
    ["CTA_REVIEW_PRIOR_CLAIM", true]);

  /* A clean "no" raises nothing. The flag must mean something. */
  check("O6 — a clean 'no' raises no flag at all",
    CB_FRONTDOOR.gateQ1({own_prior_claim:"no"}).flag, null);

  /* --- O6b: Q1b, the only gate left in the front door ----------------- */

  check("O6b — no UK tax bill is the one thing that still stops the flow",
    [CB_FRONTDOOR.gateQ1b({is_uk_taxpayer:"no"}).gated,
     CB_FRONTDOOR.gateQ1b({is_uk_taxpayer:"charity"}).gated,
     CB_FRONTDOOR.gateQ1b({is_uk_taxpayer:"yes"}).gated],
    [true, true, false]);

  /* REVERSED 3 September 2026. "Not sure" previously terminated alongside "no"
     and "charity". A practice manager who does not know their company's tax
     position is the ORDINARY case, not the suspicious one, and terminating on
     it destroyed good leads at the third question. It now continues — and the
     figure carries the condition on its face rather than asserting it, which
     keeps an unknown out of the favourable branch without pretending we know
     something we do not. */
  check("O6b — 'not sure' does NOT terminate",
    CB_FRONTDOOR.gateQ1b({is_uk_taxpayer:"not sure"}).gated, false);

  check("O6b — instead it carries a condition on the face of the figure",
    /assumes the business pays UK corporation tax or income tax/i
      .test(CB_FRONTDOOR.gateQ1b({is_uk_taxpayer:"not sure"}).condition || ""), true);

  check("O6b — and it flags for confirmation on the call",
    CB_FRONTDOOR.gateQ1b({is_uk_taxpayer:"not sure"}).flag,
    "CONFIRM_TAX_STATUS_ON_CALL");

  /* The profit question is a follow-up, not a peer. Asking a charity whether it
     is profitable is asking a question whose answer cannot matter. */
  check("O6b — the profit question fires only for a UK taxpayer",
    ["yes","no","charity","not sure"].map(v =>
      CB_FRONTDOOR.gateQ1b({is_uk_taxpayer:v}).askProfit),
    [true, false, false, false]);

  /* The correction. A previous owner having claimed is normally what MAKES
     the claim possible post-2014, so gating on it rejects exactly the
     transactions that succeed. */
  check("O6 — a previous owner's claim never gates, on any answer",
    ["yes","no","don't know"].map(v =>
      CB_FRONTDOOR.gateQ1({previous_owner_claimed:v}).gated),
    [false, false, false]);

  check("O6 — and 'not sure' about your own claim does not gate either",
    CB_FRONTDOOR.gateQ1({own_prior_claim:"not sure"}).gated, false);

  /* "Don't know" is the commonest honest answer and must stay unresolved
     rather than be written into the engine as a fact. */
  (function(){
    const q = CB_FRONTDOOR.QUESTIONS.find(q => q.id === "F1b");
    const dk = {}; q.onSet(dk, "don't know");
    const yes = {}; q.onSet(yes, "yes");
    check("O6 — 'don't know' sets no engine fact; 'yes' sets one",
      [dk.prior_owner_entitled === undefined, yes.prior_owner_entitled],
      [true, "yes"]);
    /* PHASE 154a1 (line 13): "no" is a seller who did not claim, not one who
       could not. It used to set prior_owner_entitled "no" - the best case -
       which inverted the pooling requirement (R-B1) at the front door. */
    const no = {}; q.onSet(no, "no");
    check("O6 — 'no' records that the previous owner did not claim, and leaves whether they could to its own question",
      [no.prior_owner_claimed, no.prior_owner_entitled === undefined, dk.prior_owner_claimed === undefined],
      ["no", true, true]);
  })();

  /* A gated client is the one most worth talking to. */
  check("O6 — the gate offers a call rather than just closing the door",
    CB_FRONTDOOR.gateQ1({own_prior_claim:"yes"}).offerCall, true);

  /* --- O7: CORRECTION 2 — April 2014, delegated and NOT one date ------ */

  /* The threshold is the regime commencement plus two years, which is 1
     April 2014 for companies and 6 April 2014 for income tax payers. A
     single hard-coded date would flatten that split, and the originally
     described 1 January 2014 would misclassify every transaction in the
     first quarter of that year. */
  check("O7 — the threshold is April 2014, and it is two dates not one",
    [CB_FRONTDOOR.poolingTest({claimant_type:"company"}).thresholdISO,
     CB_FRONTDOOR.poolingTest({claimant_type:"individual"}).thresholdISO],
    ["2014-04-01", "2014-04-06"]);

  check("O7 — it is not 1 January 2014",
    CB_FRONTDOOR.poolingTest({claimant_type:"company"}).thresholdISO.indexOf("-01-01"),
    -1);

  /* The delegation itself. A constant in the front door could drift away
     from the engine's, and the client-facing half is exactly where nobody
     would notice. */
  (function(){
    const i = src.indexOf("var CB_FRONTDOOR");
    const j = src.indexOf("var CB_FEE");

    /* Strip comments AND string literals before looking for a year. All three
       are stripped for different reasons. The prose necessarily discusses
       April 2014 — that is the correction being explained. The client-facing
       help text says "since April 2014" too, and should: it is the sentence
       that tells an owner a previous claim helps them rather than hurts them.
       What must not exist is a year in the EXECUTABLE half, because that would
       be a second clock, and a second clock is what drifts. */
    const body = src.slice(i, j)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/"(?:[^"\\]|\\.)*"/g, "");

    check("O7 — the front door computes with no year of its own",
      /\b(?:2012|2014)\b/.test(body), false);

    check("O7 — and it reaches the threshold through the engine",
      /CB_S187A\.(?:commencementDate|poolingRequirementInForce)/.test(body), true);

    /* The copy carries the correction too, and this is the half a client
       actually reads. January 2014 would misclassify every transaction in
       the first quarter of that year. */
    const copy = src.slice(i, j);
    check("O7 — the client-facing copy says April 2014, and never January 2014",
      [/April 2014/.test(copy), /January 2014|1 January 2014|2014-01/.test(copy)],
      [true, false]);
  })();

  /* --- O8: CORRECTION 3 — a closed window is never a bare nil --------- */

  (function(){
    /* Window closed: bought directly from the owner who claimed, long ago. */
    const closed = { past_owner_disposal_mode:"sold_market",
                     prior_owner_entitled:"yes",
                     acquisition_date:"2016-01-01",
                     __now:"2026-09-02" };
    const w = CB_FRONTDOOR.windowOutcome(closed);

    check("O8 — the window is closed on these facts",
      w.open, false);

    check("O8 — and the outcome is not a nil",
      w.nil, false);

    /* The two routes that survive a closed election window. Telling a client
       they are out of time while either is open is the most expensive error
       this engine could make. */
    check("O8 — the tribunal and written-statement routes are both still shown",
      [/tribunal/i.test(w.routes.join(" ")),
       /written statements/i.test(w.routes.join(" ")),
       /no time limit/i.test(w.routes.join(" "))],
      [true, true, true]);

    /* Renovation spend is unaffected by any of this and stands on its own.
       This is the sentence that stops a closed window reading as nothing. */
    check("O8 — and the client's own renovation spend is named as unaffected",
      /renovation or fit-out spend of your own/i.test(w.routes.join(" ")), true);

    check("O8 — a closed or unresolvable window routes to a specialist",
      [w.needsSpecialist,
       CB_FRONTDOOR.windowOutcome({}).needsSpecialist],
      [true, true]);
  })();

  /* --- O9: the clock's start is derived, never assumed ---------------- */

  (function(){
    /* Direct purchase from the owner who claimed: the clock runs from the
       client's own completion. */
    const direct = { past_owner_disposal_mode:"sold_market",
                     prior_owner_entitled:"yes", acquisition_date:"2025-01-01" };

    /* An intervening owner: it runs from THEIRS, and where that date is not
       known the engine must not fall back to the client's. */
    const intervening = { past_owner_disposal_mode:"sold_market",
                          prior_owner_entitled:"no", earlier_entitled_owner:"yes",
                          acquisition_date:"2025-01-01" };

    /* And the commonest case of all — nobody knows. */
    const unsure = { past_owner_disposal_mode:"sold_market",
                     acquisition_date:"2025-01-01" };

    check("O9 — a direct purchase runs the clock from the client's completion",
      CB_S187A.windowStart(direct).basis, "client_acquisition");

    check("O9 — an intervening owner with no known date is NOT derivable",
      [CB_S187A.windowStart(intervening).derivable,
       CB_S187A.windowStart(intervening).basis],
      [false, "intervening_acquisition"]);

    check("O9 — and an unresolved chain does not quietly become the client's own date",
      [CB_S187A.windowStart(unsure).derivable,
       CB_S187A.windowStart(unsure).date],
      [false, null]);

    /* The front door must consume that, not route around it. */
    check("O9 — the front door reports the unresolved case as open, not closed",
      CB_FRONTDOOR.windowOutcome(unsure).open, null);
  })();

  /* --- O10: the fee is 3% of ALLOWANCES IDENTIFIED, not tax saved -----
     Q55 ANSWERED 3 September 2026. Lakhbir Dhillon: "The 5% is on the
     allowance." PHASE 74 rebuilt CB_FEE from a basis-unknown refusal to a
     data-readiness refusal, and refuses ONLY where the allowances figure has
     not itself been computed for the case. PHASE 132e (16 September 2026)
     set the rate to a flat 3% on Lakhbir's answer read 15 September 2026.
     On a £500,000 allowance at 25% tax the two readings differ fourfold —
     £15,000 (allowances, OURS) vs £3,750 (tax saved, REJECTED) — and these
     assertions fail if CB_FEE is ever silently switched back to the
     tax-saved reading, or back to 5%. */
  (function(){
    const d = CB_FEE.display(500000, 0.25);

    check("O10 — the rendered fee is 3% of ALLOWANCES IDENTIFIED, not tax saved",
      [d.render, d.amount], [true, 15000]);

    check("O10 — the tax-saved reading is still computed for comparison, and is NOT what renders",
      [d.readings.of_allowances, d.readings.of_tax_saved, d.amount !== d.readings.of_tax_saved],
      [15000, 3750, true]);

    check("O10 — the two readings differ fourfold on the same facts — the basis is load-bearing",
      d.readings.of_allowances / d.readings.of_tax_saved, 4);

    /* The refusal path is NOT deleted — Phase 74 repoints it at data
       readiness instead of at the now-answered basis question. */
    const noAllowances = CB_FEE.display(null, 0.25);
    check("O10 — still refuses to render where the allowances figure is not yet computed for this case",
      [noAllowances.render, noAllowances.amount], [false, null]);

    check("O10 — the refusal reason now names the missing data, not the old basis-unknown wording",
      [/allowances.*not.*computed|not been computed/i.test(noAllowances.reason),
       /basis has not been confirmed/i.test(noAllowances.reason)],
      [true, false]);

    check("O10 — the not-capped-by-tax-saved disclosure is always present, rendered or refused",
      typeof d.disclosure === "string" && /not capped by/i.test(d.disclosure) && /may exceed/i.test(d.disclosure),
      true);
  })();

  /* --- O11: booking, and the entry point everybody forgets ------------ */

  check("O11 — a call is offered at all three entry points",
    CB_BOOKING.ENTRY_POINTS.map(p => CB_BOOKING.offerAt(p).offer),
    [true, true, true]);

  /* The gated exit is the highest-value place to offer a call and the one
     that gets left out. A client just told they probably have no claim is
     the client most worth talking to. */
  check("O11 — the gated exit offers it primarily, not as a footnote",
    CB_BOOKING.offerAt("gated_exit").prominence, "primary");

  /* AMENDED PHASE 71, 3 September 2026. Three channels, and VIDEO IS GONE.
     This assertion previously read ["video","phone"] and asserted that
     scheduling-only channels were withheld from the conversation. Both halves
     changed by decision: video was dropped, email was added, and SMS/WhatsApp
     became one client-facing choice recording two processors. Nothing is
     "scheduling only" any more — every channel offered is a route to a human. */
  check("O11 — three channels are offered, and video is not one of them",
    CB_BOOKING.offerAt("gated_exit").channels.map(c => c.id),
    ["phone","sms_whatsapp","email"]);

  check("O11 — video is gone, and its second job went with it",
    CB_BOOKING.CHANNELS.some(c => c.id === "video"), false);

  /* Only the telephone books a moment. Offering a slot on email implies a
     promptness we may not keep. */
  check("O11 — the telephone is the only channel that books a slot",
    CB_BOOKING.CHANNELS.filter(c => c.booksASlot).map(c => c.id), ["phone"]);

  /* WhatsApp holds client contact data on Meta's infrastructure. It is a
     sub-processor and must be declared before it is switched on. The id is now
     the combined channel, because that is the control the client sees. */
  check("O11 — the SMS/WhatsApp channel is flagged as needing a processor declaration",
    CB_BOOKING.processorChannels(), ["sms_whatsapp"]);

  /* The declaration is not advisory. A channel whose processor has not been
     declared MUST NOT RENDER — building the option and documenting it later is
     the wrong order and it is the order everyone takes. */
  check("O11 — an undeclared processor channel does not render",
    CB_BOOKING.renderableChannels([]).map(c => c.id), ["phone","email"]);

  check("O11 — and once declared, it does",
    CB_BOOKING.renderableChannels(["sms_whatsapp"]).map(c => c.id),
    ["phone","sms_whatsapp","email"]);

  /* Consent is per channel, and marketing is a separate unticked box. Bundling
     them is what turns a requested callback into a marketing complaint. */
  check("O11 — consent is per channel, marketing is separate and never pre-ticked",
    [CB_BOOKING.CONSENTS.length,
     CB_BOOKING.CONSENTS.filter(c => c.preTicked).length,
     CB_BOOKING.CONSENTS.filter(c => c.marketing).map(c => c.required)],
    [2, 0, [false]]);

  /* The funnel now CLOSES here rather than continuing to a contract, so this
     screen writes the lead. Account creation is the next screen and it is
     skippable — a caller that defers persistence to it loses the client. */
  check("O11 — the funnel close persists the lead, the assessment and the estimate",
    [CB_BOOKING.offerAt("funnel_close").persistsLead,
     CB_BOOKING.offerAt("funnel_close").persistsAssessment,
     CB_BOOKING.offerAt("funnel_close").persistsEstimate,
     CB_BOOKING.offerAt("funnel_close").skippable],
    [true, true, true, false]);

  /* --- O12: the shape of the front door ------------------------------- */

  /* Six substantive questions to a range. The extras are conditional
     follow-ups on the renovation branch and the non-gating previous-owner
     question, which is why the count reads nine. */
  check("O12 — the front door is six substantive questions plus conditionals",
    [CB_FRONTDOOR.QUESTIONS.filter(q => !q.showIf && q.id !== "F1b").length,
     CB_FRONTDOOR.QUESTIONS.filter(q => q.showIf).length,
     CB_FRONTDOOR.QUESTIONS.length],
    [6, 3, 10]);

  /* With the layer off nothing is confirmed and everything is asked — which
     is today's behaviour, and is what makes this phase shippable. */
  check("O12 — with the layer off, no question is answered by confirmation",
    CB_FRONTDOOR.shape(CB_REGISTRY.derive({}, {})).confirmed, []);

  /* And with it on, the two register-backed questions become confirmations.
     This is the condensation, demonstrated rather than asserted. */
  withLayerOn(function(){
    /* AMENDED PHASE 71 — this now names a residential sector, because for the
       four commercial sectors the purchase question is NOT retired by the free
       register and never was. See O3. */
    const d = CB_REGISTRY.derive({
      hmlr:{price_paid:450000, completion_date:"2019-06-01"},
      companies_house:{entity_type:"limited company", year_end:"03-31"} },
      {nation:"england", sector:"supported_living"});
    check("O12 — with the layer on, the purchase and entity questions are confirmations",
      CB_FRONTDOOR.shape(d).confirmed, ["F4","F5"]);

    /* And the honest counterpart: for a care home the entity question is still
       retired, but the purchase question is not. This is the real shape of the
       condensation for most clients. */
    const c2 = CB_REGISTRY.derive({
      hmlr:{price_paid:450000, completion_date:"2019-06-01"},
      companies_house:{entity_type:"limited company", year_end:"03-31"} },
      {nation:"england", sector:"care_homes"});
    check("O12 — for a commercial sector the entity question is retired but the purchase question is not",
      CB_FRONTDOOR.shape(c2).confirmed, ["F5"]);
  });

  /* The renovation timing question — the addition that changes the answer
     rather than refining it, because spend before the client owned the
     building belongs to somebody else's claim. */
  check("O12 — the renovation branch asks when, not only what and how much",
    CB_FRONTDOOR.QUESTIONS.filter(q => q.id.indexOf("F3") === 0).map(q => q.id),
    ["F3","F3a","F3b","F3c"]);

  /* Cosmetic work is usually a repair — immediately deductible, often better
     for the client, and not this claim. Saying so beats showing a nil. */
  (function(){
    const q = CB_FRONTDOOR.QUESTIONS.find(q => q.id === "F3a");
    const s = {}; q.onSet(s, "cosmetic renovation");
    const f = {}; q.onSet(f, "full renovation");
    check("O12 — cosmetic work is flagged as probably a repair rather than shown as nil",
      [s.renovation_is_probably_repair, f.renovation_is_probably_repair],
      [true, false]);
  })();
}

/* =====================================================================
   P. PHASE 71 — the multi-property front door.

   The funnel now takes any number of properties. Sector, entity type,
   trigger and spend are captured PER PROPERTY, because a group can hold
   a care home and a dental practice in two companies, bought one and
   built the other, and every one of those facts changes the statutory
   machinery applied to that property.

   THE ASSERTIONS THAT MATTER MOST ARE P2 AND P4.

   P2 is the one that keeps the condensation. The correctness fix —
   per-property trigger and entity — must cost the SINGLE-PROPERTY client
   nothing, because that client is the majority and carries the drop-off
   risk. Property 1 renders neither control and inherits both silently.
   If P2 ever fails, a six-screen funnel has quietly become an
   eight-screen one for the people it was condensed for.

   P4 is the double-count. Where a property's trigger was a refurbishment
   or a fit-out, Q2 has ALREADY taken that spend, and asking "any work
   done?" against it invites the client to enter the same money twice —
   inflating the figure by exactly the amount they were most confident
   about, which is the worst possible error to make quietly.
   ===================================================================== */
if (startSuite("P", "Phase 71 — the multi-property front door")) {

  /* --- P1: trigger selects the statutory machinery -------------------- */

  check("P1 — a purchase apportions; everything else is invoice analysis",
    CB_FRONTDOOR.TRIGGERS.map(t => CB_FRONTDOOR.methodFor(t)),
    ["s562_apportionment","invoice_analysis","invoice_analysis","invoice_analysis"]);

  /* The spend pair follows the property's OWN trigger. A client who bought
     one and built another must be asked correctly on each. */
  check("P1 — each trigger asks for its own spend pair",
    CB_FRONTDOOR.TRIGGERS.map(t => CB_FRONTDOOR.spendFieldsFor(t).amount),
    ["purchase_price","build_cost","works_cost","fitout_cost"]);

  check("P1 — a leasehold fit-out also asks when the lease began",
    CB_FRONTDOOR.spendFieldsFor("fit_out").extra, "lease_start_year");

  check("P1 — an unknown trigger yields no spend fields rather than a default pair",
    CB_FRONTDOOR.spendFieldsFor("something_else"), null);

  /* --- P2: the correctness fix costs the majority nothing ------------- */

  (function(){
    const first = CB_FRONTDOOR.propertyDefaults(0, {trigger_default:"purchase"});
    const later = CB_FRONTDOOR.propertyDefaults(1, {trigger_default:"purchase"});

    /* THE ASSERTION THAT PROTECTS THE FUNNEL. Property 1 shows neither
       control. Drop-off happens in the first block, not inside a repeater
       the client chose to open. */
    check("P2 — property 1 renders NEITHER the trigger nor the entity control",
      [first.renderTrigger, first.renderEntity], [false, false]);

    check("P2 — property 2 renders both, and both arrive pre-answered",
      [later.renderTrigger, later.renderEntity, later.entityDefault, later.trigger],
      [true, true, "yes", "purchase"]);
  })();

  /* --- P3: the entity NAME is never asked ----------------------------- */

  /* The figure needs the entity TYPE, which sets the tax rate. The NAME only
     matters for the common-control test, which is post-engagement work, so
     the adviser resolves it on the call rather than the funnel carrying a
     field for it. */
  (function(){
    const src2 = src.slice(src.indexOf("var CB_FRONTDOOR"), src.indexOf("var CB_FEE"));
    check("P3 — the front door carries no entity-name field",
      /entity_name|company_name|companyName/.test(src2), false);
  })();

  /* --- P4: the works heading, and the double-count it prevents -------- */

  check("P4 — a bought or built property is asked about work plainly",
    ["purchase","new_build"].map(t => CB_FRONTDOOR.worksHeadingFor(t).alreadyCaptured),
    [false, false]);

  check("P4 — a refurbished or fitted-out property is asked about FURTHER work",
    ["refurb","fit_out"].map(t => CB_FRONTDOOR.worksHeadingFor(t).heading),
    ["Any further work since?","Any further work since?"]);

  check("P4 — and it says what was already given, so the client is not asked twice",
    [/already told us about the refurbishment/i.test(CB_FRONTDOOR.worksHeadingFor("refurb").sub),
     /already told us about the fit-out/i.test(CB_FRONTDOOR.worksHeadingFor("fit_out").sub)],
    [true, true]);

  /* --- P5: the combined ceiling, and its honesty problem -------------- */

  (function(){
    const one = CB_FRONTDOOR.combineCeilings([{ceiling:540000}]);
    const three = CB_FRONTDOOR.combineCeilings(
      [{ceiling:540000},{ceiling:430000},{ceiling:270000}]);

    check("P5 — the total is the sum of the live properties",
      [one.total, three.total, three.count], [540000, 1240000, 3]);

    /* The breakdown is the control on the headline and a caller must be
       handed it rather than having to ask. Summing upper bounds gives the
       SUM OF MAXIMA — the outcome where every property simultaneously lands
       at the top of its own band, which is the outcome nobody gets. */
    check("P5 — the breakdown travels with the total and is marked required",
      [three.breakdown.length, three.breakdownRequired], [3, true]);

    /* The headline gets weaker with every property added, and the module
       says so rather than leaving the caller to notice. */
    check("P5 — the headline's reliability degrades as properties are added",
      [one.headlineReliability,
       three.headlineReliability,
       CB_FRONTDOOR.combineCeilings([{ceiling:1},{ceiling:1},{ceiling:1},{ceiling:1},{ceiling:1}]).headlineReliability],
      ["single","weakening","prefer_range"]);

    /* A terminal property is named on its own line, never silently dropped
       and never allowed to collapse the whole assessment. */
    const mixed = CB_FRONTDOOR.combineCeilings(
      [{ceiling:540000},{terminal:true, code:"NO_TAX_TO_RELIEVE"},{ceiling:270000}]);
    check("P5 — a terminal property is excluded from the total but not from the page",
      [mixed.total, mixed.count, mixed.terminalProperties.length],
      [810000, 2, 1]);
  })();

  /* --- P6: readiness is per property, not one boolean ----------------- */

  (function(){
    const s = { is_uk_taxpayer:"yes", properties:[
      { address:"A", sector:"care_homes", entity_type:"ltd", trigger:"purchase",
        purchase_price:2100000, completion_date:"2024-03-01" },
      { address:"B", sector:"dental", entity_type:"ltd", trigger:"refurb" }
    ]};
    const r = CB_FRONTDOOR.readyForRange(s);

    check("P6 — a complete property reads ready and an incomplete one names what is short",
      [r.ready, r.properties[0].ready, r.properties[1].ready,
       r.properties[1].missing.indexOf("works_cost") !== -1],
      [false, true, false, true]);
  })();

  /* An explicit "I don't know" IS an answer. A null is not. That distinction
     is the whole of N4 in one line, and getting it backwards would either
     block the client or manufacture a fact. */
  (function(){
    const s = { is_uk_taxpayer:"yes", properties:[
      { address:"A", sector:"gp", entity_type:"partnership", trigger:"purchase",
        purchase_price:"unknown", completion_date:"unknown" }]};
    check("P6 — an explicit 'I don't know' satisfies the field; it does not block the range",
      CB_FRONTDOOR.readyForRange(s).ready, true);
  })();

  check("P6 — no property yet is not ready, and says so plainly",
    CB_FRONTDOOR.readyForRange({is_uk_taxpayer:"yes", properties:[]}).why,
    "no property has been given yet");

  /* Q1 no longer stops the flow, so readiness must not consult it. The old
     implementation short-circuited on gateQ1 and would now never fire. */
  check("P6 — a prior claim no longer blocks the range",
    CB_FRONTDOOR.readyForRange({ is_uk_taxpayer:"yes", own_prior_claim:"yes",
      properties:[{ address:"A", sector:"dental", entity_type:"ltd",
                    trigger:"new_build", build_cost:900000, completion_date:"2022-01-01" }]}).ready,
    true);

  /* The one thing that still does. */
  check("P6 — no UK tax bill still does",
    CB_FRONTDOOR.readyForRange({is_uk_taxpayer:"charity", properties:[]}).code,
    "NO_TAX_TO_RELIEVE");

  /* The tax-status caveat has to reach the screen that renders the figure. */
  check("P6 — an unknown tax status carries its condition through to the figure",
    /assumes the business pays UK/i.test(
      CB_FRONTDOOR.readyForRange({ is_uk_taxpayer:"not sure",
        properties:[{ address:"A", sector:"dental", entity_type:"ltd",
                      trigger:"new_build", build_cost:900000, completion_date:"2022-01-01" }]
      }).condition || ""), true);
}

/* =====================================================================
   Q. PHASE 72 — the funnel, wired in.

   The condensed front door is no longer a dormant module. It is what a
   visitor meets, and the five sector engines have become Stage 2.

   THE TWO ASSERTIONS THAT EARN THIS SUITE:

   Q1 IS THE PROMISE. Six screens to a figure. The whole point of this
   phase was that a GP surgery met SEVENTEEN questions before seeing a
   number. If SCREENS ever grows, the condensation has been lost and it
   will have been lost one well-argued question at a time.

   Q2 IS THE DRIFT TRAP. Every sector engine carries its own YIELD_BAND,
   and the funnel now sizes the only number the client sees from CB_BAND.
   Two copies of the same constant WILL diverge — quietly, in the half of
   the system nobody re-reads — so this asserts they are still identical.
   It fails the day somebody tunes a band inside an engine and forgets
   the front door.
   ===================================================================== */
if (startSuite("Q", "Phase 72 — the funnel, wired in")) {

  /* --- Q1: six screens to a figure ------------------------------------ */

  check("Q1 — the front door is exactly six screens",
    CB_FUNNEL.SCREENS, ["Q1","Q1a","Q1b","Q1c","Q2","Q3"]);

  /* The count is the promise, stated separately so a rename cannot quietly
     smuggle a seventh screen past the assertion above. */
  check("Q1 — and there are six of them, not seven",
    CB_FUNNEL.SCREENS.length, 6);

  /* --- Q2: the bands have one source of truth ------------------------- */

  /* Each sector engine declares `const YIELD_BAND = { <sector>:{...} }` and
     exposes it. This pulls every one of them out of the LOADED ENGINE and
     compares it, key by key, with the shared table the funnel reads.

     PHASE 113 — IT USED TO READ THE BANDS OUT OF `src` WITH A REGULAR
     EXPRESSION, AND THAT MADE THE TRAP BLIND IN PACKAGE MODE. `src` is always
     the SITE file, in both modes, so `--package` compared THE SITE's sector
     bands against THE PACKAGE's shared table: a band that diverged in the
     package's own sector files passed. Proved rather than assumed, twice —
     Phase 102 moved the care_homes purchase band to [0.20,0.55] in the package
     and package mode stayed green at 634, and Phase 113 reproduced it at 640
     before changing anything. Only verify-extraction.cjs's byte comparison
     caught it either time. Reading ENGINES instead puts the artefact on trial
     that the mode says is on trial, in both modes, with the same two checks.

     The key is taken from the engine's OWN declaration, not from the SECTORS
     list, so an engine that declared its band under the wrong sector name is
     still caught by the key check below rather than silently renamed here. */
  (function(){
    const declared = {};
    SECTORS.forEach(s => {
      const yb = ENGINES[s] && ENGINES[s].YIELD_BAND;
      if (!yb) return;          /* absent — the key check below is what reports it */
      Object.keys(yb).forEach(k => { declared[k] = yb[k]; });
    });

    check("Q2 — all five sector engines declared a band, and under their own name",
      Object.keys(declared).sort(),
      ["care_homes","dental","gp","private_hospital","supported_living"]);

    /* The comparison itself. Both sides are key-sorted before stringifying —
       the engines appear in source order and CB_BAND in its own, and comparing
       raw JSON would fail on ordering alone and say nothing useful. JSON rather
       than deepEqual so a real mismatch prints the numbers. */
    const sortKeys = o => Object.keys(o).sort().reduce((a,k) => { a[k] = o[k]; return a; }, {});
    check("Q2 — every engine's YIELD_BAND still matches the shared CB_BAND",
      JSON.stringify(sortKeys(declared)),
      JSON.stringify(sortKeys(Object.keys(declared).reduce((a,k) => {
        a[k] = CB_BAND.BANDS[k]; return a; }, {}))));
  })();

  /* The four front-door triggers collapse onto three band keys. A
     refurbishment and a fit-out share a band; they do not share a method. */
  check("Q2 — the four triggers map onto three band keys",
    CB_FRONTDOOR.TRIGGERS.map(t => CB_BAND.bandKey(t)),
    ["purchase","new_build","refurb_fitout","refurb_fitout"]);

  check("Q2 — an unknown trigger yields no band rather than a default one",
    CB_BAND.bandFor("gp","something_else"), null);

  /* The engine still computes a RANGE. Only the display collapsed to a
     ceiling — a stored ceiling cannot be explained later or replayed after
     a CTA switch moves. */
  check("Q2 — rangeFor returns both bounds, and the ceiling is the upper one",
    (function(){ const r = CB_BAND.rangeFor("gp","purchase",1200000);
      return [r.low, r.high]; })(),
    [180000, 360000]);

  /* --- Q3: the figure, and the properties it must not lose ------------ */

  (function(){
    const S = CB_FUNNEL.blankState();
    S.is_uk_taxpayer = "yes";
    S.properties = [
      { address:"A", sector:"care_homes", trigger:"purchase", spend:2000000 },
      { address:"B", sector:"dental",     trigger:"refurb",   spend:300000  },
      { address:"C", sector:"gp",         trigger:"purchase", spend_unknown:true }
    ];
    const f = CB_FUNNEL.figure(S);

    check("Q3 — the total is the sum of the priced properties only",
      [f.total, f.count], [1070000, 2]);

    /* THE ONE THAT MATTERS. A property the client typed in must appear
       somewhere on the page. Before this, an unpriced property fell through
       both filters and vanished — the client entered three addresses and saw
       two, with nothing saying why. */
    check("Q3 — every property given is accounted for, priced or not",
      [f.accountedFor, f.unpricedProperties.length, S.properties.length],
      [3, 1, 3]);

    check("Q3 — and the unpriced one carries a reason to show the client",
      /rough figure/i.test(f.unpricedProperties[0].why), true);
  })();

  /* --- Q4: the assumptions travel with the figure --------------------- */

  /* With the range collapsed to a single "up to" number, this list is the
     only guard left on it. */
  (function(){
    const S = CB_FUNNEL.blankState();
    S.is_uk_taxpayer = "yes";
    S.properties = [{ address:"A", sector:"gp", trigger:"purchase", spend:1200000 }];
    const a = CB_FUNNEL.assumptions(S);

    check("Q4 — the ceiling is described as a ceiling that moves down",
      a.some(x => /ceiling, not a forecast/i.test(x) && /moves it down/i.test(x)), true);

    check("Q4 — the band is described as assessed, not independently calibrated",
      a.some(x => /assessed, not independently calibrated/i.test(x)), true);

    check("Q4 — and it says plainly that no register has been checked",
      a.some(x => /no registers have been checked/i.test(x)), true);
  })();

  /* An unknown tax status must reach the figure as a condition on its face,
     not be quietly dropped between the gate and the screen. */
  (function(){
    const S = CB_FUNNEL.blankState();
    S.is_uk_taxpayer = "not sure";
    S.properties = [{ address:"A", sector:"gp", trigger:"purchase", spend:1200000 }];
    check("Q4 — an unknown tax status rides on the front of the assumptions",
      /assumes the business pays UK/i.test(CB_FUNNEL.assumptions(S)[0]), true);
  })();

  /* A prior claim no longer stops anything, so it has to be visible on the
     figure instead — otherwise removing the gate loses the fact entirely. */
  (function(){
    const S = CB_FUNNEL.blankState();
    S.is_uk_taxpayer = "yes"; S.own_prior_claim = "yes";
    S.properties = [{ address:"A", sector:"gp", trigger:"purchase", spend:1200000 }];
    check("Q4 — a prior claim appears in the assumptions rather than stopping the flow",
      CB_FUNNEL.assumptions(S).some(x => /claim may already have been made/i.test(x)), true);
  })();

  /* Multiple properties get the arithmetic explained, because adding
     ceilings is the weakest number in the funnel. */
  (function(){
    const S = CB_FUNNEL.blankState();
    S.is_uk_taxpayer = "yes";
    S.properties = [{ address:"A", sector:"gp", trigger:"purchase", spend:1200000 },
                    { address:"B", sector:"dental", trigger:"purchase", spend:400000 }];
    check("Q4 — with more than one property the addition is explained",
      CB_FUNNEL.assumptions(S).some(x => /adds the top of each property/i.test(x)), true);
  })();

  /* --- Q5: the sector engines are Stage 2, not the front door --------- */

  /* pickSector must no longer be what a visitor meets. The engines keep every
     question they have; they are simply asked later, of a client who has
     agreed to work with us. */
  check("Q5 — the boot starts the funnel, not the sector selector",
    /FN\.start\(\)/.test(src), true);

  /* Matched on the unescaped half of the sentence. The source stores its dashes
     and middots as — and · escapes, so a regex written with the
     rendered characters silently never matches — which would make this
     assertion pass-by-accident in the direction of "no check at all". */
  check("Q5 — the sector selector is relabelled as Stage 2",
    /the full assessment, for a client who has already engaged us/.test(src), true);

  /* The hero hand-off used to launch a sector engine. It now seeds the
     funnel's first property, because sector is a property-level fact and a
     client may have several. */
  check("Q5 — the hero sector hand-off seeds the funnel rather than launching an engine",
    /properties\[0\]\.sector = seeded/.test(src), true);

  /* --- Q6: still nothing external, and still no register derivation --- */

  check("Q6 — the derivation layer is still off after wiring the funnel",
    CB_REGISTRY.precondition.enabled, false);

  /* WhatsApp holds client contact data on a third party's infrastructure.
     The funnel passes no declared processors, so it must not render. */
  check("Q6 — the contact screen renders no undeclared processor channel",
    /renderableChannels\(\[\]\)/.test(src), true);

  /* --- Q7: the privacy notice at the address question (PHASE 153) ------
     Tracker item 12955356558, 28 September 2026. The free lookups rest on
     legitimate interests, whose condition is a published notice reachable
     from the address question (CB_REGISTRY.precondition.requires). The link
     is drawn at Q2 only while that same switch is on - no second gate - and
     with no tick box, because the basis is informed, not consented (standing
     rule 13(b)). FN is DOM code, so it is lifted here from the SITE FILE's
     own text with the smallest stub that works (as the gated-exit renderer
     proof does), in both --package and site mode: this is page text, not
     engine arithmetic. Q7 FAILS on "Caprebate site.html.bak-phase153". */
  (function(){
    const layerAt = src.indexOf("var CB_PLANT"), layerEnd = src.indexOf("/* ===== care_homes", layerAt);
    const fnAt = src.indexOf("var FN = (function(){"), fnEnd = src.indexOf("\n})();", fnAt);
    const nodes = {};
    const doc = { getElementById: id => nodes[id] || (nodes[id] = { id, style: {}, textContent: "", innerHTML: "", scrollTop: 0 }) };
    let L = null;
    try {
      L = new Function("document", src.slice(layerAt, layerEnd) + "\n;" + src.slice(fnAt, fnEnd + "\n})();".length) +
        "\n;return { FN: FN, CB_REGISTRY: CB_REGISTRY };")(doc);
    } catch (e) { L = null; }
    /* Q1 -> Q1a -> Q1b -> Q1c -> Q2, the address question, with the switch as given; restored at once. */
    function atAddress(on) {
      if (!L) return "";
      const was = L.CB_REGISTRY.precondition.enabled;
      L.CB_REGISTRY.precondition.enabled = on;
      try {
        L.FN.start(); L.FN.set("is_uk_taxpayer", "yes"); L.FN.next(); L.FN.next(); L.FN.next();
        L.FN.setTrigger("purchase"); L.FN.next();
        return nodes.stage ? nodes.stage.innerHTML : "";
      } finally { L.CB_REGISTRY.precondition.enabled = was; }
    }
    const off = atAddress(false), on = atAddress(true);
    const link = /<a href="\/notices\/"[^>]*>/;
    check("Q7 — the funnel renderer lifts from the site file and reaches the address question",
      [L !== null, /Where is it\?/.test(off), /Where is it\?/.test(on)], [true, true, true]);
    check("Q7 — the switch ships off, so the address question draws no link to /notices/",
      [L && L.CB_REGISTRY.precondition.enabled, link.test(off), /q2-notice/.test(off)], [false, false, false]);
    check("Q7 — with the same switch on, the address question links to /notices/, above the address box",
      [link.test(on), on.indexOf('href="/notices/"') >= 0 && on.indexOf('href="/notices/"') < on.indexOf("Where is it?")],
      [true, true]);
    check("Q7 — it informs and asks nothing: no tick box is added at the address question",
      (on.match(/type="checkbox"/g) || []).length, (off.match(/type="checkbox"/g) || []).length);
    check("Q7 — the gate is CB_REGISTRY.precondition itself: the link is drawn under its enabled flag and nowhere else",
      /function noticeAtAddress\(\)\{\s*if\(!\(CB_REGISTRY\.precondition && CB_REGISTRY\.precondition\.enabled === true\)\) return '';/.test(src),
      true);
  })();
}

/* =============================================================================
   SUITE R - Phase 77: the realised-benefit model and the fee comparison.
   Board item 12966924106.

   THE FIXTURE IS A REAL COMPETITOR FILE, not a case we invented. Eureka
   Capital Allowances, 1A Albert Street, invoice 8134/24, 16 December 2024:
   main pool GBP 34,075, special rate GBP 39,665, allowances identified
   GBP 73,740, higher-rate taxpayer at 40%, first period 2022/23. The report's
   own writing-down schedule is reproduced line for line below, which is what
   makes this a benchmark rather than a self-consistency check - if the model
   drifts, it drifts away from a document a real client was sent.

   ONE DELIBERATE DIVERGENCE, IN YEAR FIVE. Eureka's schedule runs the main
   pool at 18% throughout because it was written in 2024. FA 2026 moved the
   main pool to 14% for periods beginning on or after 6 April 2026 for income
   tax, so our fifth year (2026/27) is 14% and theirs is 18%. Ours is right and
   theirs was right when written. The assertion below pins OUR figure and says
   why it differs, so nobody later "fixes" it back.
   ============================================================================= */
if (startSuite("R", "Phase 77 — realised benefit vs the fee")) {

  /* PHASE 113d — the upper bound was "var CB_BOOKING" and is now
     "var CB_GATE_CONFIG", because CB_GATE was inserted between the two. THIS
     IS NOT A NARROWING OF R2: CB_GATE_CONFIG is the block that now begins
     immediately after CB_BENEFIT ends, so this slice is character for
     character the text R2 was written to test. The engagement gate states a
     0.25 TARGET MARGIN, which is a commercial margin and not a tax rate, and
     it is restated from phase9 deliberately and asserted equal in suite T —
     leaving it inside this slice would make R2 fail for a reason R2 is not
     about. R2 still guards the benefit module, which is what acquires stray
     18s and 6s. */
  const benefitSrc = src.slice(src.indexOf("var CB_FEEGUARD"), src.indexOf("var CB_GATE_CONFIG"));
  const r2 = n => (typeof n === "number") ? Math.round(n * 100) / 100 : n;

  /* --- R1: the switches ship OFF, and the source says so --------------- */

  /* The build-then-sign-off pattern CB_CTA established. Whether we cap, warn
     or do neither is a commercial decision for Lakhbir and possibly the CTA
     (Q90); it is not a build decision, so it is built and left off. */
  check("R1 — both fee-guard switches exist and are OFF as shipped",
    [CB_FEEGUARD.fee_cap_at_year_one_benefit,
     CB_FEEGUARD.fee_warn_when_exceeds_benefit],
    [false, false]);

  /* Asserted against the FILE and not only the loaded object, because a test
     that reads the object it has already been free to mutate proves nothing
     about what ships. */
  check("R1 — the shipped file declares both switches false",
    [/fee_cap_at_year_one_benefit:\s*false/.test(src),
     /fee_warn_when_exceeds_benefit:\s*false/.test(src),
     /fee_cap_at_year_one_benefit:\s*true/.test(src),
     /fee_warn_when_exceeds_benefit:\s*true/.test(src)],
    [true, true, false, false]);

  /* --- R2: no rate is restated in the benefit module ------------------- */

  /* LEG-E1 was raised because MARGINAL_RATE existed five times and the copies
     had already drifted. A benefit model is exactly the kind of module that
     would quietly acquire its own 18% and its own 6%. Strip the comments and
     the string literals - both necessarily discuss the rates - and assert the
     EXECUTABLE half states none of them. */
  (function(){
    const body = benefitSrc
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/"(?:[^"\\]|\\.)*"/g, "");
    check("R2 — the benefit module states no rate of its own",
      /(?:^|[^\w.])0\.\d+/.test(body), false);
    check("R2 — and it reaches every rate through CB_RATES",
      [/CB_RATES\.WDA\./.test(body),
       /CB_RATES\.FIRST_YEAR\./.test(body),
       /CB_RATES\.hybridMainRate/.test(body)],
      [true, true, true]);
  })();

  /* --- R3: the Eureka schedule, line for line -------------------------- */

  const EUREKA = { main: 34075, special: 39665, allowances: 73740,
                   rate: 0.40, period_start: "2022-04-06" };

  const eu = CB_BENEFIT.assess({
    main: EUREKA.main, special: EUREKA.special, tax_rate: EUREKA.rate,
    period_start: EUREKA.period_start, is_company: false, years: 5
  });

  check("R3 — every fact is known, so the model is DETERMINED, not a range",
    [eu.modelled, eu.determined, eu.scenarios.length, eu.allowances],
    [true, true, 1, 73740]);

  /* The published schedule, rounded to the pound as the report prints it.
     Year five is ours, not theirs - see the header note. */
  check("R3 — main-pool WDA reproduces the published schedule (year 5 at the FA 2026 rate)",
    eu.scenarios[0].rows.map(r => Math.round(r.main_wda)),
    [6134, 5029, 4124, 3382, 2157]);

  check("R3 — special-rate WDA reproduces the published schedule in full",
    eu.scenarios[0].rows.map(r => Math.round(r.special_wda)),
    [2380, 2237, 2103, 1977, 1858]);

  /* Eureka's own first three totals: 8,513 / 7,267 / 6,227. */
  check("R3 — the year-one allowance is the published 8,513",
    Math.round(eu.scenarios[0].rows[0].allowance), 8513);

  check("R3 — the 2026 main-pool change is respected: 18% for four years, then 14%",
    eu.scenarios[0].rows.map(r => r.main_wda_rate),
    [0.18, 0.18, 0.18, 0.18, 0.14]);

  /* The report states the allowances "will provide income tax savings of
     GBP 29,496 (based on higher tax rate 40%)" - that is the LIFETIME figure,
     73,740 x 40%. What lands in year one is 8,513 x 40%. */
  check("R3 — year-one benefit is the published year-one allowance at 40%",
    r2(eu.year_one_benefit), 3405.36);

  check("R3 — and it is within a pound of the report's own rounded arithmetic",
    Math.abs(eu.year_one_benefit - 8513 * 0.40) < 1, true);

  check("R3 — cumulative benefit over the five-year horizon",
    [r2(eu.cumulative_benefit), eu.horizon_years], [12552.20, 5]);

  /* --- R4: the comparison, on the case that prompted the phase --------- */

  const euFee = EUREKA.allowances * CB_FEE.RATE;
  const cmp = CB_BENEFIT.compare(euFee, eu);

  check("R4 — our fee on the Eureka allowances is 3% of 73,740",
    r2(cmp.fee), 2212.2);

  /* THE FINDING, RE-DERIVED AT 3% IN PHASE 132e. At 5% the fee exceeded the
     headline year-one relief on this case by GBP 281.64. At 3% it does not:
     on headline figures the client is ahead in year one by GBP 1,193.16. The
     exposure has not gone - R5 shows the real profits still put the fee above
     the year-one cash - but it is no longer visible on the headline rate. */
  check("R4 — at 3% fee_exceeds_year_one_benefit is FALSE on the headline figures",
    cmp.fee_exceeds_year_one_benefit, false);

  check("R4 — and the client is ahead in year one by 1,193.16, not a rounding artefact",
    r2(cmp.year_one_benefit - cmp.fee), 1193.16);

  /* Over five years the client is comfortably ahead. Both numbers are
     returned because the decision needs both: the exposure is a TIMING
     problem, not a value problem, and a cap set on the wrong one of these
     would be the wrong cap. */
  check("R4 — over five years the fee is well under the benefit",
    [cmp.fee_exceeds_cumulative_benefit, r2(cmp.fee_to_cumulative_benefit)],
    [false, 0.18]);

  check("R4 — the fee is 0.65x the year-one benefit",
    r2(cmp.fee_to_year_one_benefit), 0.65);

  /* The third option Lakhbir has already put on the table: the fee rate is a
     variable sales discusses with the client (3% from Phase 132e, with a
     discretionary multi-site discount whose size and approver are not set). This is the number that
     conversation needs - the rate at which the fee stops exceeding the
     year-one benefit on these facts. It decides nothing. */
  check("R4 — the breakeven fee rate for year one is computed, at 4.62%",
    Math.round(cmp.breakeven_fee_rate_year_one * 10000) / 10000, 0.0462);

  check("R4 — and against the five-year benefit it is 17.02%",
    Math.round(cmp.breakeven_fee_rate_cumulative * 10000) / 10000, 0.1702);

  /* --- R5: the profits constraint makes the exposure LARGER ------------ */

  /* The real client's furnished-holiday-let profits were 2,525 in 2022/23 and
     8,366 in 2023/24. Only 2,525 of the 8,513 allowance could be used; the
     rest became a loss carried forward. The report's own figure for the
     2022/23 repayment is GBP 1,010.00 and the model reproduces it exactly.

     This is the assertion that matters most for the decision: the headline
     figures are the OPTIMISTIC ones. At 3% the headline says the client is
     ahead in year one; the real profits say the fee is still more than twice
     the year-one cash. */
  const euP = CB_BENEFIT.assess({
    main: EUREKA.main, special: EUREKA.special, tax_rate: EUREKA.rate,
    period_start: EUREKA.period_start, is_company: false, years: 5,
    profits: [2525, 8366, 0, 0, 0]
  });

  check("R5 — constrained by the real profits, year one relieves the report's 1,010.00",
    r2(euP.year_one_benefit), 1010);

  check("R5 — the unused allowance is carried forward as a loss, not lost",
    r2(euP.scenarios[0].rows[0].loss_carried_forward), 5988.40);

  check("R5 — so against the real year-one cash the 3% fee is 2.19x, not 0.65x",
    r2(CB_BENEFIT.compare(euFee, euP).fee_to_year_one_benefit), 2.19);

  check("R5 — and on the real profits it exceeds the year-one cash by 1,202.20",
    [CB_BENEFIT.compare(euFee, euP).fee_exceeds_year_one_benefit,
     r2(euFee - euP.year_one_benefit)],
    [true, 1202.2]);

  check("R5 — with no profits figure the model says so rather than assuming one",
    eu.assumptions.some(a => /no profits figure/.test(a)), true);

  /* --- R6: unknowns are bounded, never guessed ------------------------- */

  /* The case the site can actually produce today: an allowances figure, a tax
     rate, and neither a pool split nor a period start. Two unknowns, four
     scenarios, and an answer that is a range. */
  const un = CB_BENEFIT.assess({ allowances: 500000, tax_rate: 0.25 });

  check("R6 — two unknowns produce four scenarios and no point estimate",
    [un.determined, un.scenarios.length, un.year_one_benefit, un.cumulative_benefit],
    [false, 4, null, null]);

  check("R6 — the range runs from all-special at 6% to all-main at 18%",
    un.year_one_benefit_range.map(r2), [7500, 22500]);

  check("R6 — the unknowns are named, not silently resolved",
    [un.unknowns.length,
     un.unknowns.some(u => /pool split is not determined/.test(u)),
     un.unknowns.some(u => /period start is not known/.test(u))],
    [2, true, true]);

  /* The three-valued boolean. A 25,000 fee on a 500,000 allowance at 25%
     exceeds the year-one benefit on EVERY scenario in the range, so the answer
     is true and it is earned. Where a range straddles, the answer is null -
     which is where our own 3% fee of 15,000 now sits (R8). These are figures
     passed to compare() directly, to test the boolean, not our fee. */
  const unC = CB_BENEFIT.compare(25000, un);
  check("R6 — the boolean is true only because every scenario agrees",
    [unC.fee_exceeds_year_one_benefit, unC.fee_exceeds_cumulative_benefit],
    [true, false]);

  check("R6 — a fee inside the range returns null, not a guess",
    CB_BENEFIT.compare(15000, un).fee_exceeds_year_one_benefit, null);

  check("R6 — a fee below the whole range returns false",
    CB_BENEFIT.compare(7000, un).fee_exceeds_year_one_benefit, false);

  /* --- R7: BOTH SWITCHES OFF LEAVES TODAY'S RENDER UNTOUCHED ----------- */

  /* The assertions in suite O already pin the rendered amount at 15,000 on a
     500,000 allowance (3% from Phase 132e). These pin the rest of the shipped shape:
     the disclosure string character for character, and the fact that nothing
     new is applied to the amount. */
  /* CORRECTED 12 SEPTEMBER 2026 (Phase 127 sweep), in step with CB_FEE.DISCLOSURE.
     The sentence Phase 74 wrote quoted "often 18% or 6% a year"; the main pool
     rate is 14% for chargeable periods from April 2026, and Rulebook I's rule is
     that no rate is stated outside its table. Only those words changed. */
  /* CORRECTED 16 SEPTEMBER 2026 (Phase 132e): "5%" became "3%", twice, on the
     flat 3% decision. Every other word is unchanged, and this assertion is
     what proves it. */
  const DISCLOSURE_AS_SHIPPED =
    "Our fee is 3% of the capital allowances identified, not 3% of the tax you "+
    "save. Allowances are usually claimed gradually — as writing-down allowances "+
    "on a reducing balance, at the rate in force for each period — over as long as a decade, while our fee falls due "+
    "at once. That means the tax you actually save in any one year can be, and "+
    "often is, less than the fee. The fee is not capped by, and may exceed, "+
    "what you save in tax in a given year.";

  const shipped = CB_FEE.display(500000, 0.25);

  check("R7 — with both switches off the rendered amount is unchanged",
    [shipped.render, shipped.amount, shipped.capped, shipped.uncapped_amount, shipped.warning],
    [true, 15000, false, null, null]);

  check("R7 — the disclosure is byte-identical to the sentence Phase 74 wrote, at 3%",
    shipped.disclosure, DISCLOSURE_AS_SHIPPED);

  check("R7 — the fee rate is the flat 3% of Phase 132e, and the basis is untouched",
    [CB_FEE.RATE, shipped.readings.of_allowances, shipped.readings.of_tax_saved],
    [0.03, 15000, 3750]);

  /* --- R8: the comparison is returned on EVERY call -------------------- */

  /* The whole point of the phase. A figure that exists is a figure someone can
     act on; a field that is sometimes simply absent is one no caller builds
     against. So it is present on the refusal path too, saying why. */
  const refused = CB_FEE.display(null, 0.25);

  check("R8 — the refusal path still carries a comparison object",
    [refused.render, typeof refused.comparison, refused.comparison.computed],
    [false, "object", false]);

  check("R8 — and it names why it could not be computed",
    /allowances identified for this case have not been computed/.test(refused.comparison.why),
    true);

  check("R8 — the refusal object exposes the same fields, as nulls, not as absences",
    ["fee_exceeds_year_one_benefit", "year_one_benefit", "cumulative_benefit",
     "breakeven_fee_rate_year_one"].every(k => k in refused.comparison),
    true);

  /* At 5% the fee exceeded the whole range and this was true. At 3% the
     15,000 fee sits inside the 7,500 to 22,500 range, so the honest answer is
     null - the pool split decides it. */
  check("R8 — a rendered call carries a computed comparison with no ctx at all",
    [shipped.comparison.computed, shipped.comparison.determined,
     shipped.comparison.fee_exceeds_year_one_benefit],
    [true, false, null]);

  /* --- R9: each switch changes exactly one thing ----------------------- */

  /* PHASE 132e. At 3% the fee no longer exceeds the Eureka HEADLINE year-one
     relief (R4), so a switch test on the headline figures would test nothing.
     The switches are exercised on the same file WITH its real profits, where
     the fee does exceed the year-one cash (R5). */
  const CTX = { main: EUREKA.main, special: EUREKA.special,
                period_start: EUREKA.period_start, is_company: false,
                profits: [2525, 8366, 0, 0, 0] };

  (function(){
    const off = CB_FEE.display(EUREKA.allowances, EUREKA.rate, CTX);
    check("R9 — baseline: determined, exceeds, and NOTHING applied",
      [off.amount, off.capped, off.warning,
       off.comparison.determined, off.comparison.fee_exceeds_year_one_benefit],
      [2212.2, false, null, true, true]);

    /* cap ON, warn OFF */
    CB_FEEGUARD.fee_cap_at_year_one_benefit = true;
    const capped = CB_FEE.display(EUREKA.allowances, EUREKA.rate, CTX);
    CB_FEEGUARD.fee_cap_at_year_one_benefit = false;

    check("R9 — cap ON changes the amount to the year-one benefit",
      [capped.capped, r2(capped.amount), r2(capped.uncapped_amount)],
      [true, 1010, 2212.2]);
    check("R9 — cap ON adds NO warning and does not touch the disclosure",
      [capped.warning, capped.disclosure === DISCLOSURE_AS_SHIPPED],
      [null, true]);
    check("R9 — cap ON leaves the underlying 3%-of-allowances reading intact",
      capped.readings.of_allowances, 2212.2);

    /* warn ON, cap OFF */
    CB_FEEGUARD.fee_warn_when_exceeds_benefit = true;
    const warned = CB_FEE.display(EUREKA.allowances, EUREKA.rate, CTX);
    CB_FEEGUARD.fee_warn_when_exceeds_benefit = false;

    check("R9 — warn ON adds a case-specific sentence",
      [typeof warned.warning, /more than the tax you would actually save in the first year/.test(warned.warning || "")],
      ["string", true]);
    check("R9 — warn ON changes the amount by NOTHING",
      [warned.amount, warned.capped, warned.uncapped_amount],
      [2212.2, false, null]);
    check("R9 — warn ON does not reword or replace the standing disclosure",
      warned.disclosure, DISCLOSURE_AS_SHIPPED);

    /* and the switches are back where they started */
    check("R9 — both switches restored to OFF after the flip test",
      [CB_FEEGUARD.fee_cap_at_year_one_benefit,
       CB_FEEGUARD.fee_warn_when_exceeds_benefit],
      [false, false]);
  })();

  /* The cap refuses to fire on an undetermined model. Capping against a range
     means choosing a number out of that range on the client's behalf. */
  (function(){
    /* PHASE 132e. A range on which the fee exceeds EVERY scenario, so the cap
       is refused only because the model is undetermined - not because the fee
       happens to sit inside the range. Profits of 1,000 a year hold every
       scenario's year-one relief to 250. */
    CB_FEEGUARD.fee_cap_at_year_one_benefit = true;
    const d = CB_FEE.display(500000, 0.25, { profits: [1000, 1000, 1000, 1000, 1000] });
    CB_FEEGUARD.fee_cap_at_year_one_benefit = false;
    check("R9 — the cap does not fire where the benefit model is only a range",
      [d.comparison.determined, d.comparison.fee_exceeds_year_one_benefit, d.capped, d.amount],
      [false, true, false, 15000]);
  })();

  /* And the warning only ever appears where the comparison actually says so. */
  (function(){
    CB_FEEGUARD.fee_warn_when_exceeds_benefit = true;
    /* a Scottish top-rate client on an all-main-pool claim: the year-one
       benefit beats the fee, so there is nothing to warn about */
    const fine = CB_FEE.display(100000, 0.48,
      { main:100000, special:0, period_start:"2024-04-06", is_company:false });
    CB_FEEGUARD.fee_warn_when_exceeds_benefit = false;
    check("R9 — no warning where the fee does not exceed the year-one benefit",
      [fine.comparison.fee_exceeds_year_one_benefit, fine.warning],
      [false, null]);
  })();

  /* --- R10: no entitlement is invented -------------------------------- */

  /* First-year reliefs change year one enormously, which is exactly why they
     are gated. reliefsEstablished reads ONLY facts the shipped engine carries,
     and on every case the shipped question set can currently produce it
     establishes nothing - because the facts that would establish them are read
     by CB_CASH and captured by no question. That is finding Q91, and these
     assertions are what will fail when someone closes it. */
  (function(){
    const purchase = CB_BENEFIT.reliefsEstablished(
      { return_in_time:true, claimant_type:"individual" }, "purchase");
    check("R10 — a second-hand purchase establishes no first-year relief",
      [purchase.aia, purchase.full_expensing, purchase.fya_special, purchase.fya_new],
      [0, false, false, false]);
    check("R10 — and it says why, naming the second-hand point the engine already makes",
      purchase.missing.some(m => /second-hand purchase cannot use full expensing/.test(m)),
      true);

    const newFitout = CB_BENEFIT.reliefsEstablished(
      { return_in_time:true, claimant_type:"company" }, "fit_out");
    check("R10 — a company fit-out still establishes nothing without new-and-unused",
      [newFitout.full_expensing, newFitout.fya_special],
      [false, false]);
    check("R10 — Q91: the AIA headroom fact is read by the engine and captured by nothing",
      newFitout.missing.some(m => /headroom for this period has not been captured/.test(m)),
      true);

    const outOfTime = CB_BENEFIT.reliefsEstablished(
      { return_in_time:false, claimant_type:"company", new_and_unused:true }, "fit_out");
    check("R10 — a return that is not open establishes nothing at all",
      [outOfTime.full_expensing, outOfTime.fya_new, outOfTime.missing.length],
      [false, false, 1]);

    /* "unsure" must behave exactly as absent - it must never open a door. */
    const unsure = CB_BENEFIT.reliefsEstablished(
      { return_in_time:true, claimant_type:"company", aia_headroom:"unsure",
        new_and_unused:true }, "fit_out");
    check("R10 — an unsure AIA headroom grants nothing",
      unsure.aia, 0);
  })();

  /* --- R11: the machinery works when entitlement IS established -------- */

  /* Not a claim that any client has these. It is the proof that the model is
     built rather than stubbed, so that the day Q91 is answered the number is
     right rather than merely present. */
  (function(){
    const fe = CB_BENEFIT.assess({
      main: 34075, special: 39665, tax_rate: 0.25,
      period_start: "2026-04-01", is_company: true, years: 5,
      first_year: { full_expensing:true, fya_special:true }
    });
    /* full expensing relieves the whole main pool at once; the 50% allowance
       takes half the special-rate pool, and the other half writes down from
       the FOLLOWING period, not this one. */
    check("R11 — full expensing plus the 50% allowance in year one",
      r2(fe.scenarios[0].rows[0].first_year_allowance),
      r2(34075 + 39665 * 0.5));
    check("R11 — the deferred 50% reaches the pool in period two, not period one",
      [r2(fe.scenarios[0].rows[0].special_wda), r2(fe.scenarios[0].rows[1].special_wda)],
      [0, r2(39665 * 0.5 * 0.06)]);
    check("R11 — and year one is now vastly larger than the WDA-only case",
      fe.year_one_benefit > 13000, true);

    /* AIA with no stated allocation is an unknown like any other: bounded, and
       Rulebook I question I-Q5 is named rather than answered. */
    const aia = CB_BENEFIT.assess({
      main: 34075, special: 39665, tax_rate: 0.40,
      period_start: "2024-04-06", is_company: false, years: 5,
      first_year: { aia: 40000 }
    });
    check("R11 — an unallocated AIA is modelled both ways and named as I-Q5",
      [aia.determined, aia.scenarios.length,
       aia.unknowns.some(u => /I-Q5/.test(u))],
      [false, 2, true]);
    check("R11 — the AIA is capped at the statutory limit from the rate table",
      CB_BENEFIT.schedule({ main:2000000, special:0, tax_rate:0.25, years:1,
                            period_start:"2024-04-01", is_company:true,
                            first_year:{ aia:5000000, aia_to:"main_first" } })
        .rows[0].first_year_allowance,
      CB_RATES.FIRST_YEAR.aia_limit);
  })();

  /* --- R12: the structural finding, larger than the competitor case ---- */

  /* Q90 escalation. On writing-down allowances alone the year-one benefit is
     (pool rate x tax rate) of the allowances. A company's highest marginal
     rate is 26.5%, so its best possible year-one return on a pure main-pool
     claim is 18% x 26.5% = 4.77% of allowances. At 5% that was BELOW our fee,
     and no company case on WDA alone cleared it.
     RE-DERIVED AT 3% IN PHASE 132e, THE FINDING NARROWS. 4.77% (and 14% x
     26.5% = 3.71% from April 2026) is now ABOVE a 3% fee, so a company on
     main-pool plant clears the fee in year one. A company on SPECIAL-RATE
     plant does not: 6% x 26.5% = 1.59%, below 3%. The question is no longer
     "company or not" but which pool the plant falls in. */
  (function(){
    const bestCompany = CB_BENEFIT.assess({
      main: 200000, special: 0, tax_rate: CB_RATES.rangeFor("company")[1],
      period_start: "2025-04-01", is_company: true, years: 5
    });
    const c = CB_BENEFIT.compare(200000 * CB_FEE.RATE, bestCompany);
    check("R12 — at 3% the best company case (main pool) clears the fee in year one",
      c.fee_exceeds_year_one_benefit, false);
    check("R12 — its breakeven rate is 4.77%, above our 3%",
      Math.round(c.breakeven_fee_rate_year_one * 10000) / 10000,
      Math.round(CB_RATES.WDA.main_2012_to_2026 * CB_RATES.rangeFor("company")[1] * 10000) / 10000);

    const specialCompany = CB_BENEFIT.assess({
      main: 0, special: 200000, tax_rate: CB_RATES.rangeFor("company")[1],
      period_start: "2025-04-01", is_company: true, years: 5
    });
    const cs = CB_BENEFIT.compare(200000 * CB_FEE.RATE, specialCompany);
    check("R12 — but a company on special-rate plant still does not: 1.59%, below 3%",
      [cs.fee_exceeds_year_one_benefit,
       Math.round(cs.breakeven_fee_rate_year_one * 10000) / 10000],
      [true, Math.round(CB_RATES.WDA.special * CB_RATES.rangeFor("company")[1] * 10000) / 10000]);

    /* An unincorporated higher-rate client on a main-pool claim clears it
       comfortably, which is why this is a question about WHICH clients rather
       than a question about the fee as such. */
    const uninc = CB_BENEFIT.assess({
      main: 200000, special: 0, tax_rate: CB_RATES.rangeFor("uninc_ruk")[1],
      period_start: "2025-04-06", is_company: false, years: 5
    });
    check("R12 — an unincorporated additional-rate client on main-pool plant does not",
      CB_BENEFIT.compare(200000 * CB_FEE.RATE, uninc).fee_exceeds_year_one_benefit,
      false);

    /* Phase 146, 22 Sep 2026. "A company on main-pool plant clears the fee" is
       true at 25% and 26.5%, NOT at the small profits rate. From April 2026 the
       main pool writes down at 14%, and 14% x 19% = 2.66%, below a 3% fee - so
       a small company on pure main-pool plant is behind in year one. Pinned so
       nobody restates the narrower finding as true of every company. */
    const smallCompany = CB_BENEFIT.assess({
      main: 200000, special: 0, tax_rate: CB_RATES.rangeFor("company")[0],
      period_start: "2026-04-01", is_company: true, years: 5
    });
    const csm = CB_BENEFIT.compare(200000 * CB_FEE.RATE, smallCompany);
    check("R12 — but a 19% company on main-pool plant from April 2026 does not: 2.66%, below 3% (Phase 146)",
      [csm.fee_exceeds_year_one_benefit,
       Math.round(csm.breakeven_fee_rate_year_one * 10000) / 10000],
      [true, Math.round(CB_RATES.WDA.main_from_2026 * CB_RATES.rangeFor("company")[0] * 10000) / 10000]);
  })();
}



/* =============================================================================
   SUITE S — PHASE 96. The £1m allowance cap, and the two facts the engine
   reads and (until today) never asked for.
   =============================================================================
   Board items 12927234522 (the cap test) and 12975908779 (the two questions).

   WHY THIS SUITE EXISTS, AND WHY IT HAD TO LAND BEFORE THE OVERHEADS WORK

   The Annual Investment Allowance is the single biggest lever on WHEN a
   client sees cash. £1,000,000 relieved in year one instead of written down
   at 18% or 6% is not a rounding difference; it is most of the client's
   first-year benefit. Three facts about the cap matter and all three are
   asserted below:

     - it is ANNUAL, so it resets every accounting year;
     - it is SHARED across companies under common control, so a client can be
       certain about their own company and still be wrong about the group;
     - SPEND CAN EXCEED WHAT IS LEFT OF IT, which is the ordinary case on a
       property claim and the reason the excess falls to writing-down
       allowances.

   WHAT WAS ACTUALLY IN THE HARNESS BEFORE THIS SUITE, stated precisely
   because the phase brief said "zero" and the truth is narrower than that.
   R11 already asserted that CB_BENEFIT.schedule caps an AIA at
   CB_RATES.FIRST_YEAR.aia_limit — one assertion, in the modelling module,
   reached through the symbol rather than the number, which is why a grep for
   "1m cap", "£1m", "1000000" or "AIA cap" found nothing. What did NOT exist
   anywhere was any assertion at all on CB_CASH GATE 2, which is the gate that
   decides whether the cash figure is shown, withheld or left open. That gate
   has three branches and none of them was covered.

   THE BRANCH THAT MATTERS MOST IS THE MIDDLE ONE.  Non-negotiable N4: an
   unknown must never produce a favourable answer. Gate 2 turns BOTH "unsure"
   AND undefined into gate = null — an open question on the report — rather
   than into a pass. Those two are asserted separately and deliberately,
   because they are the branch a refactor breaks silently: a `!s.aia_headroom`
   or a `|| 0` written anywhere near this collapses undefined into "none" or
   into a value, and every other test in this harness would go on passing.
   ============================================================================= */
if (startSuite("S", "Phase 96 — the £1m allowance cap, and the two facts we never asked for")) {

  /* Isolate gate 2. Gates 1, 3 and 4 are all satisfied so that anything the
     result reports about being blocked or unresolved comes from gate 2 and
     nothing else. */
  function cashState(extra) {
    return Object.assign({
      sufficient_profit: "yes",        /* gate 1 satisfied */
      pool_split_basis: "measured",    /* gate 3 satisfied */
      prior_claim_self: false,         /* gate 4 satisfied */
      return_in_time: true, accounting_period_end: "2026-03-31",
      claimant_type: "company", still_own_property: "yes"
    }, extra || {});
  }
  const cash = extra => CB_CASH.computeCashBenefit(cashState(extra), 100000, 140000, () => {});

  /* --- S1: the cap itself ---------------------------------------------- */

  check("S1 — the annual investment allowance cap is £1,000,000",
    CB_RATES.FIRST_YEAR.aia_limit, 1000000);
  check("S1 — and the engine holds it in ONE place, so it cannot drift",
    (engineBody.match(/aia_limit\s*:/g) || []).length, 1);

  /* --- S2: gate 2, all three branches ----------------------------------- */

  /* BRANCH 1 — "none". A hard NO. The cash figure is withheld entirely and
     the reason names the two ways headroom disappears: used elsewhere, or
     used across the group. */
  const none = cash({ aia_headroom: "none" });
  check("S2 — 'none' closes gate 2 and blocks the cash figure",
    [none.gate.aiaHeadroom, none.blocked, none.cash],
    [false, true, [null, null]]);
  check("S2 — and it says why, naming both the group and the annual reset",
    none.reasons.some(r => /no Annual Investment Allowance headroom left this period/.test(r)
                        && /across the group/.test(r)),
    true);

  /* BRANCH 2 — "unsure". THE NON-NEGOTIABLE. null, not false and not true:
     an OPEN question, not a blocked claim and not a favourable answer. */
  const unsure = cash({ aia_headroom: "unsure" });
  check("S2 — 'unsure' leaves gate 2 OPEN (null), and does NOT block",
    [unsure.gate.aiaHeadroom, unsure.blocked, unsure.unresolved],
    [null, false, true]);
  check("S2 — 'unsure' is never read as a favourable answer",
    unsure.gate.aiaHeadroom === true, false);
  check("S2 — and it names the fact that is missing rather than going quiet",
    unsure.reasons.some(r => /AIA headroom for this period not yet confirmed/.test(r)), true);

  /* BRANCH 3 — ABSENT. Must behave EXACTLY as "unsure". This is the
     assertion a refactor breaks: undefined is the state of every client who
     was never asked, and a `|| 0` or a falsy test anywhere near gate 2 turns
     it into "none" or into a pass without failing anything else here. */
  const absent = cash({});
  check("S2 — an ABSENT headroom behaves exactly as 'unsure' — N4",
    [absent.gate.aiaHeadroom, absent.blocked, absent.unresolved],
    [null, false, true]);
  check("S2 — absent and 'unsure' give the same reason, word for word",
    absent.reasons.join("|"), unsure.reasons.join("|"));
  check("S2 — an absent headroom NEVER produces a favourable gate",
    [absent.gate.aiaHeadroom === true, absent.gate.aiaHeadroom === false],
    [false, false]);

  /* BRANCH 4 — a stated amount. The only branch that lets the figure stand. */
  const stated = cash({ aia_headroom: 250000 });
  check("S2 — a stated headroom opens gate 2 and the cash figure stands",
    [stated.gate.aiaHeadroom, stated.blocked, stated.unresolved, stated.cash],
    [true, false, false, [100000, 140000]]);
  check("S2 — and a stated headroom raises no AIA reason at all",
    stated.reasons.filter(r => /Annual Investment Allowance|AIA/i.test(r)), []);

  /* Gate 4 is a DIFFERENT fact from gate 2 and closes on its own. */
  check("S2 — AIA used against other spend closes gate 4, which is not gate 2",
    (function(){ const r = cash({ aia_headroom: 250000, aia_used_elsewhere: "yes" });
      return [r.gate.aiaHeadroom, r.gate.priorClaims, r.blocked]; })(),
    [true, false, true]);

  /* PHASE 98, item 12991117818 — THE REASON MUST NOT OVER-CLAIM.
     aia_used_elsewhere is a BOOLEAN. "Some of the allowance went elsewhere"
     does not establish that none is left, so the reason may not say so — and
     the case that proves it is the one asserted immediately above, where a
     headroom of 250,000 is STATED and the flag is set. Until 8 Sep 2026 the
     client was told "no headroom left for this spend" in exactly that case.
     The gate still closes; only the explanation was wrong. */
  check("S2 — gate 4's reason does not claim there is no headroom when headroom is stated",
    (function(){
      const r = cash({ aia_headroom: 250000, aia_used_elsewhere: "yes" });
      const aiaReasons = r.reasons.filter(x => /AIA|Annual Investment Allowance/i.test(x));
      return [aiaReasons.length,
              aiaReasons.some(x => /no headroom left/i.test(x)),
              aiaReasons.some(x => /cannot tell how much of the allowance is left/i.test(x))];
    })(),
    [1, false, true]);

  /* AND THE FOLD IS ASSERTED, NOT JUST COMMENTED. One fact must never close
     two gates and print two near-identical reasons: the allowance question
     sets aia_headroom, and nothing sets aia_used_elsewhere from the same
     answer. If a later phase wires them together this fails. */
  check("S2 — a client who says the allowance is all used gets ONE reason, not two",
    (function(){
      const r = cash({ aia_headroom: "none" });
      return [r.gate.aiaHeadroom, r.gate.priorClaims,
              r.reasons.filter(x => /AIA|Annual Investment Allowance/i.test(x)).length];
    })(),
    /* gate 2 closed (false), GATE 4 LEFT OPEN (true), and exactly ONE reason.
       priorClaims staying true is the fold itself: one fact closed one gate. */
    [false, true, 1]);

  /* --- S3: the cap binds the money, not just the gate ------------------- */

  /* The gate says whether to show a figure. The cap says how big it can be.
     Both have to hold or the client gets a number the statute forbids. */
  const overCap = CB_BENEFIT.schedule({
    main: 3000000, special: 0, tax_rate: 0.25, years: 1,
    period_start: "2026-04-01", is_company: true,
    first_year: { aia: 2500000, aia_to: "main_first" } });
  check("S3 — a headroom larger than the statutory cap still relieves only £1m in year one",
    overCap.rows[0].first_year_allowance, 1000000);

  /* SPEND EXCEEDING WHAT IS LEFT is the ordinary case, not the edge case. */
  const partial = CB_BENEFIT.schedule({
    main: 3000000, special: 0, tax_rate: 0.25, years: 1,
    period_start: "2026-04-01", is_company: true,
    first_year: { aia: 250000, aia_to: "main_first" } });
  check("S3 — where spend exceeds the headroom, only the headroom is taken in year one",
    partial.rows[0].first_year_allowance, 250000);
  check("S3 — and the excess is not lost: it writes down in the main pool instead",
    partial.rows[0].main_wda > 0, true);

  /* An unknown headroom models NO first-year allowance — the slow end. That
     is the honest answer, and it is why the question below now exists. */
  const unknownRelief = CB_BENEFIT.reliefsEstablished(
    { return_in_time: true, claimant_type: "company", aia_headroom: "unsure" }, "fit_out");
  check("S3 — an unknown headroom models no AIA at all, and never assumes £1m",
    [unknownRelief.aia, unknownRelief.aia === CB_RATES.FIRST_YEAR.aia_limit],
    [0, false]);

  /* --- S4: the two questions now exist (item 12975908779) --------------- */

  const NEWQ = ["aia", "aiav", "prof"];
  const PFX = { care_homes: "Q", dental: "D", supported_living: "S", gp: "G", private_hospital: "H" };

  SECTORS.forEach(sec => {
    const ids = (ENGINES[sec].Q || []).map(q => q.id);
    check("S4 — " + sec + ": both facts the engine reads are now asked for",
      NEWQ.filter(sfx => ids.indexOf(PFX[sec] + sfx) < 0), []);
  });

  const taxpos = [];
  SECTORS.forEach(sec => (ENGINES[sec].Q || []).forEach(q => {
    if (NEWQ.indexOf(String(q.id).replace(/^[QDSGH]/, "")) >= 0) taxpos.push(q);
  }));
  check("S4 — fifteen questions across the five flows, three per sector",
    taxpos.length, 15);
  check("S4 — every one carries help text saying where the answer is found",
    taxpos.filter(q => !q.help || q.help.length < 40).map(q => q.id), []);
  check("S4 — no statutory reference reaches the client in any of them",
    taxpos.filter(q => /s\.[0-9]+|section [0-9]+|CAA|subsection/i.test(q.ask || "")).map(q => q.id), []);

  /* "I don't know" is a FIRST-CLASS option on both of the single-choice
     questions, not a thing the client works out they can skip. */
  const singles = taxpos.filter(q => q.type === "single");
  check("S4 — every choice question offers 'I don't know' as an option",
    singles.filter(q => !(q.opts || []).some(o => o[0] === "unsure")).map(q => q.id), []);
  check("S4 — and it is worded as an answer, not as a refusal to answer",
    singles.every(q => q.opts.some(o => o[0] === "unsure" && /don.t know/i.test(o[1]))), true);

  /* --- S5: what the answers actually set -------------------------------- */

  const q = (sec, sfx) => (ENGINES[sec].Q || []).find(x => x.id === PFX[sec] + sfx);

  SECTORS.forEach(sec => {
    const set = (sfx, v) => { const s = { flags: [] }; q(sec, sfx).onSet(s, v); return s; };
    check("S5 — " + sec + ": 'I don't know' on the allowance routes to the cautious branch",
      set("aia", "unsure").aia_headroom, "unsure");
    check("S5 — " + sec + ": and it never invents 0 or £1m",
      [set("aia", "unsure").aia_headroom === 0,
       set("aia", "unsure").aia_headroom === CB_RATES.FIRST_YEAR.aia_limit],
      [false, false]);
    check("S5 — " + sec + ": 'all used' is the only answer that closes the gate",
      [set("aia", "none").aia_headroom, set("aia", "known").aia_headroom],
      ["none", "unsure"]);
    check("S5 — " + sec + ": 'I don't know' on profits routes to the cautious branch",
      set("prof", "unsure").sufficient_profit, "unsure");
  });

  /* The amount is only asked of a client who has just said they know it —
     otherwise a currency field with no 'don't know' would force a guess. */
  check("S5 — the amount is asked only after the client says they know it",
    SECTORS.map(sec => [q(sec, "aiav").showIf({ aia_answer: "known" }),
                        q(sec, "aiav").showIf({ aia_answer: "unsure" }),
                        q(sec, "aiav").showIf({})])
           .every(t => t[0] === true && !t[1] && !t[2]),
    true);

  (function(){
    const sec = "care_homes";
    const set = v => { const s = { flags: [] }; q(sec, "aiav").onSet(s, v); return s; };
    check("S5 — a stated amount is carried through as a number",
      set(250000).aia_headroom, 250000);
    check("S5 — a stated nil is 'none', not zero and not 'unsure'",
      set(0).aia_headroom, "none");
    /* Over the cap is a CAPTURE error, so it is flagged rather than silently
       trimmed — but nothing downstream ever relieves more than the limit. */
    const over = set(5000000);
    check("S5 — an amount above the £1m cap is flagged, not silently corrected",
      [over.aia_headroom, over.flags.some(f => /EXCEEDS THE .* ANNUAL LIMIT/.test(f))],
      [5000000, true]);
    check("S5 — and the model still relieves no more than the cap on that answer",
      CB_BENEFIT.reliefsEstablished(
        { return_in_time: true, claimant_type: "company", aia_headroom: over.aia_headroom },
        "fit_out").aia,
      CB_RATES.FIRST_YEAR.aia_limit);
  })();

  /* Neither question is behind a switch. These are facts the engine has
     always read; capturing them is a defect fix, not a tax position. */
  check("S5 — neither fact is gated behind a CTA switch",
    taxpos.filter(q => q.type === "single" && typeof q.showIf === "function").map(q => q.id), []);
}


/* ═══════════════════════════════════════════════════════════════════════════
   SUITE T — PHASE 113d, the engagement gate. Board item 13005159647.

   Four documents specified this control and nothing implemented it. This suite
   asserts the things that make the difference between a control and a claim
   about one: off is the pre-gate behaviour and not merely similar to it; an
   unknown is neither a pass nor a fire; the volume never silently becomes 100;
   and the arithmetic is the phase9 module's rather than a copy of it living on
   this page.

   PHASE 132e (16 September 2026) SWITCHED IT ON, on Lakhbir's decision
   (answer read 15 September 2026): enabled, with 120 jobs this year. FG1 now
   asserts what ships ON; FG2 and FG8 still prove what OFF does by flipping
   it; FG10 proves both ON behaviours on the shipped settings - it fires below
   the line and passes above it - and that an unknown volume or fee, "not sure"
   and undefined alike, leaves it UNDETERMINED and withholding nothing.
   ═══════════════════════════════════════════════════════════════════════════ */
if (startSuite("T", "Phase 113d — the engagement gate, switched on by Phase 132e")) {

  let JE = null, jeError = null;
  try { JE = require(P9 + "/caprebate-job-economics.cjs"); } catch (e) { jeError = e; }

  const gateSrc = src.slice(src.indexOf("var CB_GATE_CONFIG"), src.indexOf("var CB_BOOKING"));

  /* Mutate-and-restore, as suite R does. Every T-test that needs a working
     gate wires the REAL phase9 costing in, runs, and puts the config back to
     exactly what shipped — asserted at the end of the suite. */
  const SHIPPED = {
    enabled: CB_GATE_CONFIG.enabled,
    delivery_scenario: CB_GATE_CONFIG.delivery_scenario,
    jobs_per_year: CB_GATE_CONFIG.jobs_per_year,
    target_margin: CB_GATE_CONFIG.target_margin,
    costing: CB_GATE_CONFIG.costing
  };
  function withConfig(over, fn) {
    Object.keys(over).forEach(k => { CB_GATE_CONFIG[k] = over[k]; });
    try { return fn(); }
    finally { Object.keys(SHIPPED).forEach(k => { CB_GATE_CONFIG[k] = SHIPPED[k]; }); }
  }
  const wired = JE ? { costing: JE.costingForGate } : {};

  /* --- FG1: it ships off, and the file says so ------------------------- */

  check("FG1 — the gate ships ON (Phase 132e), with 120 jobs this year and no costing wired in on this page",
    [CB_GATE_CONFIG.enabled, CB_GATE_CONFIG.jobs_per_year, CB_GATE_CONFIG.costing],
    [true, 120, null]);

  /* Against the FILE, not only the loaded object, for suite R's reason: a
     test that reads an object it has been free to mutate proves nothing about
     what ships. */
  check("FG1 — the shipped file declares the switch true and the volume 120, and neither false nor null",
    [/enabled:\s*true/.test(gateSrc),
     /jobs_per_year:\s*120,/.test(gateSrc),
     /enabled:\s*false/.test(gateSrc),
     /jobs_per_year:\s*null/.test(gateSrc)],
    [true, true, false, false]);

  /* The CB_ convention: the requires: string now records the decision, and
     keeps the estimate caveat. */
  check("FG1 — the requires: string records who decided, when, and that the costs are still estimates",
    [typeof CB_GATE_CONFIG.requires,
     /Lakhbir Dhillon/.test(CB_GATE_CONFIG.requires),
     /15 September 2026/.test(CB_GATE_CONFIG.requires),
     /16 September 2026/.test(CB_GATE_CONFIG.requires),
     /120/.test(CB_GATE_CONFIG.requires),
     /placeholder/.test(CB_GATE_CONFIG.requires) && /estimated/.test(CB_GATE_CONFIG.requires)],
    ["string", true, true, true, true, true]);

  /* --- FG2: OFF IS TODAY'S BEHAVIOUR, FIELD BY FIELD -------------------- */

  /* Not "similar to". The whole of the previous return shape, with the values
     suite R and suite O already pin, plus the fact that the ONLY new key is
     the gate report itself. */
  /* OFF, by flipping the shipped switch for the call. */
  const shippedFee = withConfig({ enabled: false }, () => CB_FEE.display(500000, 0.25));

  check("FG2 — with the gate off the rendered fee is exactly what shipped before",
    [shippedFee.render, shippedFee.amount, shippedFee.reason,
     shippedFee.capped, shippedFee.uncapped_amount, shippedFee.warning,
     shippedFee.readings.of_allowances, shippedFee.readings.of_tax_saved],
    [true, 15000, null, false, null, null, 15000, 3750]);

  /* PHASE 132e added one more key, the no-claim threshold report (suite NC). */
  check("FG2 — and the only keys added to that object since are `gate` and the no-claim report",
    Object.keys(shippedFee).filter(k =>
      ["render","amount","reason","readings","disclosure","comparison",
       "warning","capped","uncapped_amount"].indexOf(k) === -1),
    ["gate", "recommendation_threshold"]);

  check("FG2 — the refusal path is unchanged too, and also carries a gate report",
    withConfig({ enabled: false }, function(){
      const d = CB_FEE.display(null, 0.25);
      return [d.render, d.amount, d.readings, typeof d.gate, d.gate.outcome];
    }),
    [false, null, null, "object", "UNDETERMINED"]);

  /* On and undetermined are two different facts, and so are off and
     undetermined. As shipped on this page it is ON and UNDETERMINED - there is
     no costing here - and it withholds nothing. */
  check("FG2 — off and undetermined are reported as two separate facts",
    [shippedFee.gate.enabled, shippedFee.gate.determined,
     shippedFee.gate.outcome, shippedFee.gate.withholds_quote],
    [false, false, "UNDETERMINED", false]);
  check("FG2 — and as shipped it is ON and undetermined on this page, so it quotes as before",
    (function(){ const d = CB_FEE.display(500000, 0.25, { sector: "dental" });
                 return [d.gate.enabled, d.gate.determined, d.gate.outcome, d.gate.parameter,
                         d.gate.withholds_quote, d.render, d.amount]; })(),
    [true, false, "UNDETERMINED", "costing", false, true, 15000]);

  /* --- FG3: N4 — UNKNOWN IS NOT A BRANCH ------------------------------- */

  if (JE) withConfig(Object.assign({ jobs_per_year: 25 }, wired), function(){

    const absent  = CB_GATE.assess({ sector: "dental" });                  /* never asked */
    const unsure  = CB_GATE.assess({ fee: "not sure", sector: "dental" }); /* asked, declined */
    const nulled  = CB_GATE.assess({ fee: null, sector: "dental" });
    const zero    = CB_GATE.assess({ fee: 0, sector: "dental" });

    /* BOTH, as the standing rule requires: a suite that tests only the
       "unsure" string leaves the undefined case — the state of every client
       who was never asked — completely uncovered. */
    check("FG3 — an ABSENT fee and the string \"not sure\" behave identically",
      [absent.outcome, unsure.outcome, absent.parameter, unsure.parameter],
      ["UNDETERMINED", "UNDETERMINED", "expected_fee", "expected_fee"]);

    check("FG3 — and null and 0 travel the same line, not a fourth and fifth one",
      [nulled.outcome, zero.outcome, nulled.parameter, zero.parameter],
      ["UNDETERMINED", "UNDETERMINED", "expected_fee", "expected_fee"]);

    /* The point of N4. Neither of the two determined outcomes. */
    check("FG3 — an undetermined gate neither fires nor passes",
      [absent.outcome !== "FIRE", absent.outcome !== "PASS",
       absent.threshold, absent.shortfall, absent.routes_to, absent.withholds_quote],
      [true, true, null, null, null, false]);

    /* And an unknown must not become a number anywhere downstream. */
    check("FG3 — no unknown is reported as a zero",
      [absent.expected_fee, absent.loaded_cost, absent.threshold],
      [null, null, null]);
  });

  /* --- FG4: THE VOLUME. A NAMED NULL, AND NEVER 100 -------------------- */

  if (JE) {

    check("FG4 — with the volume unset the gate is UNDETERMINED, not optimistic",
      withConfig(Object.assign({ jobs_per_year: null }, wired), function(){
        const g = CB_GATE.assess({ fee: 5000, sector: "dental" });
        return [g.outcome, g.parameter, g.jobs_per_year, g.loaded_cost];
      }),
      ["UNDETERMINED", "jobs_per_year", null, null]);

    /* THE DEFECT THIS GUARDS, DEMONSTRATED RATHER THAN ASSERTED. A £5,000 fee
       (about £166,667 of allowances at 3%). At the realistic year-one volume that job
       loses money and the gate stops it; at the assumed 100 it sails through.
       So a gate that quietly defaulted to 100 would not merely be imprecise —
       it would pass the exact jobs it was built to catch. */
    const at25  = withConfig(Object.assign({ jobs_per_year: 25 },  wired),
                    () => CB_GATE.assess({ fee: 5000, sector: "dental" }));
    const at100 = withConfig(Object.assign({ jobs_per_year: 100 }, wired),
                    () => CB_GATE.assess({ fee: 5000, sector: "dental" }));

    check("FG4 — the same £5,000 fee FIRES at 25 jobs a year and PASSES at 100",
      [at25.outcome, at100.outcome], ["FIRE", "PASS"]);

    check("FG4 — and the two thresholds are the published loaded costs plus 25%",
      [at25.loaded_cost, at25.threshold, at100.loaded_cost, at100.threshold],
      [5390, 6737.5, 3590, 4487.5]);

    check("FG4 — the shortfall is stated, not left for the reader to subtract",
      at25.shortfall, 1737.5);

    /* The source must not contain the number the paper warns about. The one
       volume it states is the one Lakhbir gave. */
    check("FG4 — the config states no default of 100, and only the decided 120",
      [/jobs_per_year\s*:\s*100\b/.test(gateSrc),
       (gateSrc.match(/jobs_per_year\s*:\s*\d+/g) || [])],
      [false, ["jobs_per_year: 120"]]);
  }

  /* --- FG5: THE SCENARIO. ONE CONFIG VALUE ----------------------------- */

  if (JE) {

    /* "One config value" means one place it is SET, not one place it is
       mentioned — CB_GATE necessarily reads it and reports it back. The
       property that actually matters is that the gate holds no scenario NAME
       of its own to fall back on, so there is nowhere else for the step-down
       to have to be applied. */
    const configSrc = src.slice(src.indexOf("var CB_GATE_CONFIG"), src.indexOf("var CB_GATE ="));
    const gateBody  = src.slice(src.indexOf("var CB_GATE ="), src.indexOf("var CB_BOOKING"))
                         .replace(/\/\*[\s\S]*?\*\//g, "");
    check("FG5 — the delivery scenario is set in exactly one place, and it is S1",
      [CB_GATE_CONFIG.delivery_scenario,
       (configSrc.match(/delivery_scenario\s*:/g) || []).length,
       /SURVEYOR_VISIT|DESK_ONLY|STRAIGHT_THROUGH/.test(gateBody)],
      ["SURVEYOR_VISIT", 1, false]);

    /* S7.3: "when the step-down fires the gate moves with it in one place".
       Proved by moving that one value and nothing else. */
    const s1 = withConfig(Object.assign({ jobs_per_year: 25 }, wired),
                 () => CB_GATE.assess({ fee: 5000, sector: "dental" }));
    const s2 = withConfig(Object.assign({ jobs_per_year: 25, delivery_scenario: "DESK_ONLY" }, wired),
                 () => CB_GATE.assess({ fee: 5000, sector: "dental" }));

    check("FG5 — changing that one value moves the gate to the step-down costs",
      [s1.loaded_cost, s1.outcome, s2.loaded_cost, s2.outcome],
      [5390, "FIRE", 3620, "PASS"]);

    check("FG5 — an unknown scenario is UNDETERMINED, never a fallback scenario",
      withConfig(Object.assign({ jobs_per_year: 25, delivery_scenario: "NO_SUCH_ROUTE" }, wired),
        function(){
          const g = CB_GATE.assess({ fee: 5000, sector: "dental" });
          return [g.outcome, g.parameter, g.loaded_cost];
        }),
      ["UNDETERMINED", "delivery_scenario", null]);
  }

  /* --- FG6: IT TESTS THE FEE, NEVER THE PURCHASE PRICE ----------------- */

  /* The documents' original reason was claimant type; that reason is gone. The
     reason now is that loaded cost varies 2.2x by sector and more by volume,
     and only a fee-side test tracks both. So the gate must not be able to see
     a purchase price at all — not "must not use one". */
  check("FG6 — no purchase price, and no claimant type, appears in the module",
    [/purchase[_ ]?price/i.test(gateSrc),
     /claimant/i.test(gateSrc.replace(/\/\*[\s\S]*?\*\//g, ""))],
    [false, false]);

  /* THE FIGURE THE DOCUMENTS QUOTE FOR THIS IS THE WRONG ONE, and this suite
     found it. Three documents say "the loaded cost varies 2.2 times across the
     sectors". 2.19x is the DIRECT cost spread. The LOADED spread is 1.87x at
     100 jobs a year and NARROWS to 1.46x at the year-one 16, because overhead
     per job is sector-invariant and dominates as volume falls.
     The argument for a fee-side test survives it and is in fact strengthened:
     the VOLUME effect is the larger of the two — dental alone runs £3,290 to
     £6,740 across the volume range, 2.05x, against 1.87x across four sectors —
     which is exactly why a gate calibrated on one assumed volume is the defect
     to guard against. The four documents were corrected in this phase; these
     assertions are what they were corrected TO. */
  if (JE) check("FG6 — the real sector spread in LOADED cost, at 100 jobs and at 16",
    (function(){
      const r2 = n => Math.round(n * 100) / 100;
      const at = (s, v) => JE.costingForGate(s, "SURVEYOR_VISIT", v).loaded;
      const sp = v => r2(at("private_hospital", v) / at("dental", v));
      return [sp(100), sp(16)];
    })(), [1.87, 1.46]);

  if (JE) check("FG6 — 2.2x is the DIRECT cost spread, which is what got quoted",
    Math.round((JE.directCost("private_hospital", "SURVEYOR_VISIT") /
                JE.directCost("dental", "SURVEYOR_VISIT")) * 100) / 100, 2.19);

  if (JE) check("FG6 — and the volume effect is larger than the sector effect",
    (function(){
      const at = (s, v) => JE.costingForGate(s, "SURVEYOR_VISIT", v).loaded;
      const byVolume = at("dental", 16) / at("dental", 200);
      const bySector = at("private_hospital", 100) / at("dental", 100);
      return byVolume > bySector;
    })(), true);

  if (JE) check("FG6 — two different purchase prices with the same fee decide the same",
    withConfig(Object.assign({ jobs_per_year: 25 }, wired), function(){
      /* The caller derives the fee; the gate is handed only the fee. Same fee
         from a £400,000 job and from a £4,000,000 one, same answer. */
      const a = CB_GATE.assess({ fee: 6000, sector: "dental" });
      const b = CB_GATE.assess({ fee: 6000, sector: "dental" });
      return [a.outcome, b.outcome, a.threshold === b.threshold];
    }), ["FIRE", "FIRE", true]);

  /* --- FG7: ONE CALCULATOR, NOT TWO ------------------------------------ */

  if (jeError) {
    check("FG7 — the phase9 job-economics module loads", String(jeError), "no error");
  } else {

    /* The gate's threshold IS the module's loaded cost plus the margin. If
       this page ever grew its own cost model this comparison would drift. */
    check("FG7 — the gate's threshold is phase9's loaded cost, not a copy of it",
      withConfig(Object.assign({ jobs_per_year: 37 }, wired), function(){
        return SECTORS_ECON.map(function(sec){
          const g = CB_GATE.assess({ fee: 1, sector: sec });
          const m = JE.costingForGate(sec, "SURVEYOR_VISIT", 37);
          return [g.loaded_cost === m.loaded,
                  Math.abs(g.threshold - JE.gateThreshold(m.loaded, 0.25)) < 1e-9];
        });
      }),
      SECTORS_ECON.map(() => [true, true]));

    /* The executable half of the module states no cost of its own. Strip the
       comments and the strings — both necessarily discuss costs — and the only
       numbers left must be the margin bounds, the fee floor and, from Phase
       132e, the one volume Lakhbir gave, which is a count and not a cost. */
    check("FG7 — the gate module's executable half states no cost figure (only the decided volume, 120)",
      (function(){
        const body = gateSrc.replace(/\/\*[\s\S]*?\*\//g, "")
                            .replace(/^\s*\/\/.*$/gm, "")
                            .replace(/"(?:[^"\\]|\\.)*"/g, "");
        return (body.match(/\d[\d,]*\.?\d*/g) || [])
                 .filter(n => Number(n.replace(/,/g, "")) > 1)
                 .map(n => n.replace(/,$/, ""));
      })(), ["120"]);

    /* The two constants this page cannot require and therefore restates. */
    check("FG7 — the restated target margin equals phase9's, to the digit",
      [CB_GATE_CONFIG.target_margin, JE.GATE.target_margin,
       CB_GATE_CONFIG.target_margin === JE.GATE.target_margin],
      [0.25, 0.25, true]);

    check("FG7 — the restated delivery scenario is a real phase9 route",
      [CB_GATE_CONFIG.delivery_scenario === JE.GATE.delivery_scenario_today,
       CB_GATE_CONFIG.delivery_scenario in JE.ROUTES,
       JE.ROUTES[CB_GATE_CONFIG.delivery_scenario].priceable],
      [true, true, true]);

    check("FG7 — the volume is the decided 120 in BOTH places, so neither can quietly differ",
      [CB_GATE_CONFIG.jobs_per_year, JE.GATE.current_year_jobs], [120, 120]);

    /* The cost base is an estimate. The gate carries that rather than
       presenting a placeholder overhead as a measured one. */
    check("FG7 — a determined answer says its cost base is still a placeholder",
      withConfig(Object.assign({ jobs_per_year: 25 }, wired),
        () => CB_GATE.assess({ fee: 5000, sector: "dental" }).cost_basis_is_a_placeholder),
      true);
  }

  /* --- FG8: WHAT ON ACTUALLY DOES --------------------------------------- */

  if (JE) {

    /* £100,000 of allowances is a £3,000 fee at 3% against a £6,737.50 line. */
    const on = withConfig(Object.assign({ enabled: true, jobs_per_year: 25 }, wired),
                 () => CB_FEE.display(100000, 0.25, { sector: "dental" }));

    check("FG8 — ON, below the line, no figure is issued",
      [on.render, on.amount, on.gate.outcome, on.gate.withholds_quote],
      [false, null, "FIRE", true]);

    check("FG8 — and the reason is the sentence the four documents specify",
      on.reason, "we will come back to you with a price");

    /* The disclosure is a legal-facing sentence and applies whatever the gate
       does. Suite R makes the same point about the fee-guard switches. */
    check("FG8 — the standing disclosure survives the refusal untouched",
      [on.disclosure === CB_FEE.DISCLOSURE, on.readings.of_allowances],
      [true, 3000]);

    /* Above the line the switch changes nothing at all. */
    const onAbove = withConfig(Object.assign({ enabled: true, jobs_per_year: 25 }, wired),
                      () => CB_FEE.display(500000, 0.25, { sector: "dental" }));

    check("FG8 — ON, above the line, the quote is issued exactly as before",
      [onAbove.render, onAbove.amount, onAbove.reason, onAbove.gate.outcome],
      [true, 15000, null, "PASS"]);

    /* AND THE ONE THAT MATTERS MOST: on, but undetermined, refuses NOTHING.
       An operator who switches the gate on without supplying a volume gets
       today's behaviour, not a site that has stopped quoting. */
    const onNoVolume = withConfig({ enabled: true, jobs_per_year: null, costing: JE.costingForGate },
                         () => CB_FEE.display(100000, 0.25, { sector: "dental" }));

    check("FG8 — ON but undetermined withholds nothing and quotes as usual",
      [onNoVolume.render, onNoVolume.amount, onNoVolume.gate.outcome,
       onNoVolume.gate.withholds_quote],
      [true, 3000, "UNDETERMINED", false]);
  }

  /* --- FG10: BOTH ON BEHAVIOURS, ON THE SHIPPED SETTINGS (Phase 132e) ----- */

  if (JE) {
    /* Only the costing is wired in - exactly what a back end must do. The
       switch and the volume are the shipped ones. Dental at 120 jobs a year:
       loaded cost GBP 3,490, line GBP 4,362.50. */
    const at = fee => withConfig(wired, () => CB_GATE.assess({ fee: fee, sector: "dental" }));
    const below = at(4362.49), onLine = at(4362.5), above = at(15000);

    check("FG10 — ON as shipped: a fee below the 120-jobs line FIRES and withholds the quote",
      [below.enabled, below.jobs_per_year, below.loaded_cost, below.threshold, below.outcome,
       below.withholds_quote, below.routes_to],
      [true, 120, 3490, 4362.5, "FIRE", true, "we will come back to you with a price"]);
    check("FG10 — ON as shipped: a fee on or above the line PASSES and withholds nothing",
      [onLine.outcome, onLine.withholds_quote, above.outcome, above.withholds_quote],
      ["PASS", false, "PASS", false]);
    check("FG10 — ON as shipped, end to end: £100,000 of allowances (a £3,000 fee) is withheld; £500,000 (£15,000) is quoted",
      withConfig(wired, function(){
        const lo = CB_FEE.display(100000, 0.25, { sector: "dental" });
        const hi = CB_FEE.display(500000, 0.25, { sector: "dental" });
        return [lo.render, lo.amount, lo.reason, hi.render, hi.amount, hi.gate.outcome];
      }),
      [false, null, "we will come back to you with a price", true, 15000, "PASS"]);
    check("FG10 — every determined ON answer still says its cost base is an estimate",
      [below.cost_basis_is_a_placeholder, above.cost_basis_is_a_placeholder], [true, true]);

    /* N4, with the switch ON. The volume answered "not sure" and never given. */
    const volUnsure = withConfig(Object.assign({ jobs_per_year: "not sure" }, wired),
                        () => CB_GATE.assess({ fee: 3000, sector: "dental" }));
    const volAbsent = withConfig(Object.assign({ jobs_per_year: undefined }, wired),
                        () => CB_GATE.assess({ fee: 3000, sector: "dental" }));
    check("FG10 — ON: a volume of \"not sure\" and an undefined volume are both UNDETERMINED and withhold nothing",
      [volUnsure.outcome, volAbsent.outcome, volUnsure.parameter, volAbsent.parameter,
       volUnsure.withholds_quote, volAbsent.withholds_quote],
      ["UNDETERMINED", "UNDETERMINED", "jobs_per_year", "jobs_per_year", false, false]);
    check("FG10 — ON: and the two give identical reports",
      JSON.stringify(volUnsure), JSON.stringify(volAbsent));

    /* The fee answered "not sure" and never given, with the switch ON. */
    const feeUnsure = at("not sure");
    const feeAbsent = withConfig(wired, () => CB_GATE.assess({ sector: "dental" }));
    check("FG10 — ON: a fee of \"not sure\" and an absent fee are both UNDETERMINED and withhold nothing",
      [feeUnsure.outcome, feeAbsent.outcome, feeUnsure.parameter, feeAbsent.parameter,
       feeUnsure.withholds_quote, feeAbsent.withholds_quote],
      ["UNDETERMINED", "UNDETERMINED", "expected_fee", "expected_fee", false, false]);
    check("FG10 — ON: and those two give identical reports",
      JSON.stringify(feeUnsure), JSON.stringify(feeAbsent));
    check("FG10 — ON, end to end: a volume of \"not sure\" still quotes the small job as usual",
      withConfig(Object.assign({ jobs_per_year: "not sure" }, wired), function(){
        const d = CB_FEE.display(100000, 0.25, { sector: "dental" });
        return [d.render, d.amount, d.gate.outcome, d.gate.withholds_quote];
      }),
      [true, 3000, "UNDETERMINED", false]);
  }

  /* --- FG9: the suite put everything back ------------------------------ */

  check("FG9 — the config is byte-identical to what shipped after this suite ran",
    [CB_GATE_CONFIG.enabled, CB_GATE_CONFIG.delivery_scenario,
     CB_GATE_CONFIG.jobs_per_year, CB_GATE_CONFIG.target_margin,
     CB_GATE_CONFIG.costing],
    [true, "SURVEYOR_VISIT", 120, 0.25, null]);
}


/* =============================================================================
   SUITE U — PHASE 113f. ONE RESULT SHAPE, ASSERTED ACROSS ALL FIVE SECTORS.
   Board item 13005757306.

   THE ABSENCE OF THIS SUITE IS WHY THE DEFECT LIVED. `sector-supported_living`
   returned BARE NUMBERS for QE and TS while `EngineResult` in
   09-app/engine/src/types.ts declared both as a Range and the other four flows
   returned one — so `result.QE[1]` was `undefined` for that sector, silently,
   in every caller. Nothing was red. The generated engine is JavaScript under a
   hand-written declaration, so the compiler could not see it; and every suite
   in this file asserted a FIGURE on ONE sector at a time, so none of them could
   either. A defect that is invisible to the type checker AND to every
   per-sector assertion is exactly the class this suite exists to catch.

   SO IT ASSERTS THE SHAPE AND NOT THE FIGURES, AND IT ITERATES. One loop over
   the five, never five hand-written tests: five copies of an expectation is how
   a sixth sector arrives uncovered, and it is also how one copy quietly gets a
   different expectation from the other four.

   WHAT "THE SAME SHAPE" MEANS HERE, PRECISELY. Every key `EngineResult`
   DECLARES must be present on every sector and carry the same kind of value —
   fingerprinted and compared across the five. It does NOT require the five to
   return identical key SETS: `dental` also returns `sipp`. That is an
   undeclared extra, it is a real divergence, and asserting it here would be
   inventing a contract nobody wrote. It is recorded as a finding instead.

   ONE HALF OF THAT FINDING HAS SINCE BEEN FIXED RATHER THAN RECORDED, AND THE
   PIN BELOW MOVED WITH IT — PHASE 113h, 9 SEPTEMBER 2026, board item
   13008515631. When this suite was written `care_homes` alone returned no
   `grant`, and this comment and the pin at the foot of the suite both said so.
   That divergence turned out not to be a naming difference: care homes was
   cutting the client's claimable base by the grant fraction and disclosing it
   nowhere — no flag, no assumption, no panel. Phase 113h added all three, so
   care homes' undeclared set went from `[]` to `["grant"]` and this pin had to
   change. THE PIN CHANGING IS WHAT IT IS FOR. It is the assertion that made
   the divergence visible; a pin nobody ever has to update is a pin that was
   never watching anything. The disclosure rule itself is now asserted as a
   RULE rather than pinned as a fact, in Suite V below.

   AND THE OTHER HALF WAS DECIDED RATHER THAN RECORDED A THIRD TIME — PHASE
   113i, 10 SEPTEMBER 2026, board item 13009511146. `grant` is now DECLARED by
   `EngineResult` and sits in DECLARED below, so it is part of the cross-sector
   fingerprint and the undeclared pin is back to dental's `sipp` alone. It was
   promoted because it was already a contract in everything but the type: all
   five engines return it on their one and only return path, all five result
   screens gate a panel on it, and Suite V asserts its value. One thing had to
   be fixed first so the declaration would not be a lie — under supported
   living's F-3 switch the flag said a grant was netted when it was not — and
   that is asserted in Suite V.

   AND IT RUNS ON MORE THAN THE HAPPY PATH. A shape that only holds where a
   figure comes out is not a contract; the nil case and the referral case go
   through the same readers. Three sessions, five sectors, one fingerprint.

   PROVED ABLE TO FAIL. Before this suite was written the site was reverted on
   purpose — `QE:QE, TS:TS` put back into the supported-living return — and this
   suite reported 3 failures naming supported_living, QE and TS, in both harness
   modes, while every other suite stayed green. That is the evidence, and it is
   the reason the suite is worth its lines.
   ============================================================================= */
if (startSuite("U", "Phase 113f — one result shape, across all five sectors")) {

  /* The three sessions. Deliberately built from the same base as Suite G's, so
     a reader can see they are ordinary cases and not shapes chosen to pass. */
  function shapeState(extra) {
    return Object.assign({
      trigger: ["purchase"], deal: "property", base_amount: 2000000,
      claimant_type: "company", activity: "trade",
      dwelling_setting: "institution_commercial", acuity: "normal",
      flags: [], assumptions: [], lrr: false, return_in_time: false
    }, extra || {});
  }
  const CASES = [
    ["an ordinary purchase", {}],
    ["a new build on own cost", { trigger: ["new_build"] }],
    /* the nil / flagged path — the branch every renderer guards with QE[1]<=0 */
    ["a purchase capped to nil by s.187A", {
      prior_owner_claimed: "yes", prior_owner_entitled: "yes",
      past_owner_disposal_mode: "sold_undervalue",
      past_owner_cessation_date: "2020-01-01", dvs_statement: "no"
    }]
  ];

  /* ---- what EngineResult declares, and how to recognise each one ---------- */
  const isNum   = v => typeof v === "number" && isFinite(v);
  const isRange = v => Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]);
  /* a MaybeRange is a pair whose ends are a number or NULL — never undefined,
     never absent. `null` is "not established" and is the one state N4 forbids
     collapsing into 0. `undefined` here is the bug this suite catches. */
  const isMaybe = v => Array.isArray(v) && v.length === 2 &&
                       v.every(x => x === null || isNum(x));
  const isStrs  = v => Array.isArray(v) && v.every(x => typeof x === "string");
  const isGate  = v => v === true || v === false || v === null;
  const DECLARED = {
    outcome:     v => v === "estimate" || v === "referral",
    QE:          isRange,
    TS:          isRange,
    cash:        isMaybe,
    cashRoute:   v => v === null || typeof v === "string",
    cashBlocked: v => typeof v === "boolean",
    cashGates:   v => !!v && typeof v === "object" &&
                      ["profits", "aiaHeadroom", "poolBalances", "priorClaims"]
                        .every(k => isGate(v[k])),
    pool:        v => !!v && typeof v === "object" &&
                      typeof v.determined === "boolean" &&
                      isMaybe(v.main) && isMaybe(v.special),
    flags:       isStrs,
    assumptions: isStrs,
    speed:       v => typeof v === "string",
    lrr:         v => typeof v === "boolean",
    /* PHASE 113i — declared. A boolean on every sector and every path: `true`
       when a grant was deducted, `false` when nothing was — never absent. */
    grant:       v => typeof v === "boolean"
  };
  const DECLARED_KEYS = Object.keys(DECLARED);

  /* The fingerprint is the KIND of every declared key, in key order. Two
     sectors agree when their fingerprints are the same string — which is what
     makes this one comparison rather than twelve.

     A RANGE'S ARITY IS PART OF ITS KIND; A LIST'S LENGTH IS ITS CONTENT. QE, TS
     and cash are declared PAIRS, so their length is fingerprinted and a bare
     number arriving where a pair belongs shows up as `number` against
     `pair[2]<number>` — which is the whole defect, seen. `flags` and
     `assumptions` are lists whose length legitimately differs between sectors on
     the same facts (supported living raises one more assumption than the other
     four, every time), so fingerprinting their length would report a difference
     of WORDING as a difference of SHAPE and this suite would be noise. Their
     element types are already asserted by DECLARED above. */
  const PAIRS = { QE: true, TS: true, cash: true };
  function kindOf(k, v) {
    if (v === null) return "null";
    if (v === undefined) return "UNDEFINED";
    if (Array.isArray(v)) {
      const els = v.map(x => x === null ? "null" : typeof x)
                   .filter((x, i, a) => a.indexOf(x) === i).sort().join("|");
      return PAIRS[k] ? "pair[" + v.length + "]<" + (els || "empty") + ">" : "list";
    }
    return typeof v;
  }
  function fingerprint(r) {
    return DECLARED_KEYS.map(k => k + ":" + kindOf(k, r[k])).join(" ");
  }

  CASES.forEach(function (c) {
    const label = c[0], extra = c[1];
    const seen = {};
    SECTORS.forEach(sec => {
      let r = null;
      try { r = ENGINES[sec].runEngine(shapeState(Object.assign({ sector: sec }, extra))); }
      catch (e) { r = { __threw: e.message }; }
      seen[sec] = r;
    });

    /* (1) EVERY DECLARED KEY IS PRESENT AND THE RIGHT KIND, on every sector.
       Reported as one list of the sectors that failed, so a break names the
       sector rather than making a reader run it again to find out which. */
    DECLARED_KEYS.forEach(k => {
      const bad = SECTORS.filter(sec => !DECLARED[k](seen[sec][k]));
      check("U — " + label + ": every sector's `" + k + "` matches what EngineResult declares",
        bad, []);
    });

    /* (2) AND THE FIVE AGREE WITH EACH OTHER. (1) could in principle be
       satisfied by five different-but-valid shapes; this is the assertion the
       phase was actually named after. */
    const prints = SECTORS.map(sec => fingerprint(seen[sec]));
    const odd = SECTORS.filter((sec, i) => prints[i] !== prints[0]);
    check("U — " + label + ": all five sectors return the SAME result shape", odd, []);
  });

  /* ---- the specific reading that made this a shape fix and not a tax change --
     supported living models a CEILING: one point, not a band. So its two ends
     are EQUAL, and that is asserted rather than assumed — if they ever diverge,
     somebody has made a tax change under cover of a shape. The other four are
     genuine bands and their low end is below their high end.

     THE EQUALITY TEST ASSERTS FINITENESS TOO, AND THAT IS NOT BELT-AND-BRACES.
     Written as a bare `QE[0] === QE[1]` it PASSED under the deliberate revert,
     because `undefined === undefined` is true — a check that could not fail on
     the very defect it was written for. Found by running the negative control
     rather than by reasoning about it, which is the only way that kind of blind
     spot ever turns up. */
  const sl = ENGINES.supported_living.runEngine(shapeState({ sector: "supported_living" }));
  check("U — supported living is a point estimate: both ends of QE and TS are equal, and both are real numbers",
    [isNum(sl.QE[0]) && sl.QE[0] === sl.QE[1], isNum(sl.TS[0]) && sl.TS[0] === sl.TS[1]],
    [true, true]);
  check("U — and it is a real figure, not a pair of zeros", sl.QE[1] > 0, true);

  const banded = SECTORS.filter(s => s !== "supported_living");
  check("U — the other four are genuine bands, low strictly below high",
    banded.filter(sec => {
      const r = ENGINES[sec].runEngine(shapeState({ sector: sec }));
      return !(r.QE[0] < r.QE[1]);
    }), []);

  /* ---- the divergence this suite deliberately does NOT assert -------------
     `dental` returns `sipp`. It is not declared by EngineResult, so it is not
     part of the contract. Asserted here as a FACT rather than a rule, so that
     it is written down and so that changing it is a decision somebody makes
     rather than a silent drift.

     UPDATED BY PHASE 113h, 9 SEPTEMBER 2026. `care_homes` used to return `[]`
     here, and that was the one visible trace of a real defect: it reduced the
     base for a grant and told the client nothing. Now that it discloses like
     the other four, its extras are `["grant"]` and all five agree on that key.

     UPDATED AGAIN BY PHASE 113i, 10 SEPTEMBER 2026. `grant` has been promoted
     into `EngineResult` and into DECLARED above, so it is no longer an extra on
     any sector and this pin is back to `[[], ["sipp"], [], [], []]`. Dental's
     `sipp` is the only undeclared key, exactly as when this suite was written:
     one sector in five returns it, so it is a sector detail and not part of the
     shared contract. */
  const undeclared = {};
  SECTORS.forEach(sec => {
    const r = ENGINES[sec].runEngine(shapeState({ sector: sec }));
    undeclared[sec] = Object.keys(r).filter(k => DECLARED_KEYS.indexOf(k) === -1).sort();
  });
  check("U — the undeclared extras are exactly the known ones, and no more",
    [undeclared.care_homes, undeclared.dental, undeclared.supported_living,
     undeclared.gp, undeclared.private_hospital],
    [[], ["sipp"], [], [], []]);
}


/* =============================================================================
   SUITE V — PHASE 113h. IF A SECTOR CUTS THE BASE FOR A GRANT, IT SAYS SO.
   Board item 13008515631.

   THE DEFECT THIS IS WRITTEN AGAINST. care_homes reduced the claimable base by
   the grant fraction and disclosed it nowhere: `runEngine` returned no `grant`
   key, no assumption named the grant, and its result screen was the only one of
   the five with no "Shown net of the grant" panel. Measured on 9 September 2026
   on a £2m purchase with a 40% grant, care-home qualifying expenditure fell
   from £400,000–£800,000 to £240,000–£480,000 and the client was shown the
   lower pair with nothing on the screen saying why. The assumptions list is
   printed in full on that screen and is the client's only account of how the
   figure was reached, so a 40% cut appearing in no flag, no assumption and no
   panel is a figure they cannot reconcile.

   WHY THIS IS A RULE AND NOT A CARE-HOMES TEST. A test that pinned care homes
   would have gone green the moment care homes was fixed and would say nothing
   about a sixth sector, or about the next flow somebody edits. So it iterates
   the five and asserts an IF: whichever sectors reduce the base for a grant —
   measured here, never assumed — must all disclose it three ways. A sector that
   does NOT reduce the base is not caught by this and should not be; there is a
   real design in which a grant is left in the base and flagged instead, and
   supported living implements exactly that behind CB_CTA.grant_traced_after_
   dwelling. The rule is about consistency between what the arithmetic does and
   what the screen says, not about which arithmetic is right.

   THE THIRD LIMB IS A PAGE-COPY CHECK AND SAYS SO. The flag and the assumption
   come from the ENGINE and are therefore mode-sensitive — in --package mode
   they are read out of the package, which is the point. The PANEL is renderer
   code, deliberately excluded from the package, so it can only be read from the
   site's own source in both modes. That is the same footing as the brand-name
   and no-payment-processor checks in this file, and it is named here because
   Suite Q was once blind for precisely the opposite reason: a check that reads
   an artefact's TEXT cannot test a second artefact, however the mode flag is
   set. Do not read the panel limb as evidence about the package.

   PROVED ABLE TO FAIL. Before this suite was accepted, the disclosure was taken
   back out of ONE flow on purpose — dental's `A.push` and its `grant:grant>0`
   removed from the site, and its panel line deleted — and this suite reported
   FOUR failures, every one of them naming dental and nothing else, in both
   harness modes: the flag, the assumption, the rate inside the assumption, and
   the panel. The other four sectors stayed green and so did every other suite.
   The revert was then undone and the suite went green again.

   AND THE ONE ASSERTION THAT DID NOT FIRE UNDER THAT REVERT IS THE POINT OF THE
   SEPARATION. "disclosure changed nothing" stayed GREEN throughout, because
   removing the disclosure did not touch the arithmetic — which is exactly the
   distinction Phase 113h had to keep: the figure is one thing and what the
   client is told about it is another, and this suite can tell them apart.

   PHASE 113i, 10 SEPTEMBER 2026 — THE SHARED SENTENCE IS NOW A CONTRACT, AND
   GP IS OUT OF IT ON PURPOSE. Board item 13009511146. Four sectors stated one
   rule three ways: `(40%)`, `(40% of the figure)`, and the latter again with a
   `grant/donation-` limb. "Of the figure" was the wrong one, and that was shown
   by running it rather than argued: the rate comes off the SPEND, and a
   disposal-value or election ceiling applied afterwards can stop the figure
   moving at all. On a £2m purchase with a 40% grant and an earlier owner's
   £120,000 disposal value, care homes and private hospitals told the client
   "40% of the figure" had been removed while the figure stayed at £120,000.
   Every sector outside the exemption now says `grant-funded spend removed
   (40%)` — private hospitals with its `grant/donation-` limb, which is
   sector-specific and real — and shows ONE panel. Limb (4) below pins that one
   form. It does not pin five strings.

   GP IS EXEMPT, AND THE EXEMPTION IS MEASURED RATHER THAN LISTED. A flow whose
   grant wording branches on how the grant was QUANTIFIED is carrying a legal
   caveat (Cyril Lord Carpets Ltd v Schofield 42 TC 637; HMRC CA14100) whose
   substance is still open with the tax adviser. Flattening it into the shared
   sentence would delete the caveat to make strings match. The exempt set is
   pinned as a FACT, so a second sector adopting that branch is a decision
   somebody makes rather than a silent drift.

   AND `grant` NOW MEANS "A GRANT WAS DEDUCTED", ASSERTED UNDER THE ONE SWITCH
   WHERE STATING AND DEDUCTING COME APART — limb (5). With supported living's
   F-3 switch on, an untraced scheme-wide grant is left in the base on purpose,
   and the flag used to stay `true`: "Shown net of the grant" over an
   assumption saying the grant was NOT deducted. Fixed in the site before
   `grant` was declared in EngineResult.
   ============================================================================= */
if (startSuite("V", "Phase 113h — a sector that cuts the base for a grant discloses it")) {

  /* One ordinary session, run twice per sector: once clean, once with a grant.
     Same base as Suites G and U, so a reader can see it is not a shape picked
     to pass. 40% is the figure the defect was measured at. */
  const GRANT_FRACTION = 0.4;
  function grantState(sec, withGrant) {
    const st = {
      sector: sec, trigger: ["purchase"], deal: "property", base_amount: 2000000,
      claimant_type: "company", activity: "trade",
      dwelling_setting: "institution_commercial", acuity: "normal",
      flags: [], assumptions: [], lrr: false, return_in_time: false
    };
    if (withGrant) { st.grant_answer = "some"; st.grant_fraction = GRANT_FRACTION; }
    return st;
  }

  /* WHICH SECTORS THE RULE BINDS, MEASURED RATHER THAN LISTED. A sector is in
     scope if supplying the grant actually moves its qualifying expenditure
     DOWN. Nothing here hard-codes which four, or five, that is. */
  const REDUCERS = [], INERT = [];
  const RESULT = {};
  SECTORS.forEach(sec => {
    const clean = ENGINES[sec].runEngine(grantState(sec, false));
    const withG = ENGINES[sec].runEngine(grantState(sec, true));
    RESULT[sec] = withG;
    (withG.QE[1] < clean.QE[1] ? REDUCERS : INERT).push(sec);
  });

  /* A guard on the guard: if NOTHING reduces, every assertion below passes
     vacuously and this suite would be worthless while reading green. */
  check("V — the rule has something to bind: at least one sector reduces the base for a grant",
    REDUCERS.length > 0, true);

  /* (1) THE FLAG. A caller that writes `r.grant` gets a boolean, not undefined. */
  check("V — every sector that reduces the base returns `grant: true`",
    REDUCERS.filter(sec => RESULT[sec].grant !== true), []);

  /* (2) THE ASSUMPTION. The assumptions list is printed in full on the result
     screen and is the client's only account of how the figure was reached, so
     the reduction has to appear in it. THIS LIMB does not pin the wording, so it
     binds GP too: the grant is named at all, exactly once, so neither silence
     nor a double deduction reads green. The shared WORDING is pinned in limb
     (4), for the sectors that share it and not for GP — see the header. */
  const grantLines = sec => RESULT[sec].assumptions.filter(a => /grant/i.test(a));
  check("V — every sector that reduces the base names the grant in exactly one assumption",
    REDUCERS.filter(sec => grantLines(sec).length !== 1), []);
  check("V — and that assumption states the rate that was applied",
    REDUCERS.filter(sec => grantLines(sec).every(a =>
      a.indexOf(String(Math.round(GRANT_FRACTION * 100)) + "%") === -1)), []);

  /* (3) THE PANEL — A PAGE-COPY CHECK. Read from the site's own source in both
     modes, for the reason set out at the head of this suite. Sliced per sector
     from the `/* ===== <sector> ===== *\/` markers the extractor and liftEngine
     both use, so it cannot accidentally read a neighbouring flow's panel. */
  function sectorSource(sector) {
    const start = engineBody.indexOf("/* ===== " + sector + " ===== */");
    if (start < 0) throw new Error("sector block not found: " + sector);
    let end = engineBody.length;
    SECTORS.forEach(other => {
      if (other === sector) return;
      const at = engineBody.indexOf("/* ===== " + other + " ===== */");
      if (at > start && at < end) end = at;
    });
    return engineBody.slice(start, end);
  }
  /* the slice really is one flow's worth: it must hold this sector's own
     runEngine and not the next one's. */
  check("V — the per-sector slice bounds exactly one flow",
    SECTORS.filter(sec => {
      const t = sectorSource(sec);
      return t.split("function runEngine(s){").length !== 2;
    }), []);

  check("V — every sector that reduces the base shows a panel saying so, gated on the returned flag",
    REDUCERS.filter(sec => {
      const t = sectorSource(sec);
      return t.indexOf("if(r.grant)") === -1 ||
             t.indexOf("Shown net of the grant") === -1;
    }), []);

  /* (4) PHASE 113i — ONE SENTENCE AND ONE PANEL, FOR THE SECTORS THAT SHARE THEM.
     The exemption is measured off the source: a flow whose grant wording
     branches on `grant_quantification` is carrying a legal caveat and is left
     alone. Pinned as a fact so that changing it is a visible decision. */
  const EXEMPT = SECTORS.filter(sec => sectorSource(sec).indexOf("grant_quantification") !== -1);
  check("V — the sectors exempt from the shared sentence are exactly the known one (GP, for its Cyril Lord caveat)",
    EXEMPT, ["gp"]);
  const SHARED = REDUCERS.filter(sec => EXEMPT.indexOf(sec) === -1);
  check("V — the shared sentence has something to bind: at least one non-exempt sector reduces the base",
    SHARED.length > 0, true);

  const RATE = String(Math.round(GRANT_FRACTION * 100));
  const SHARED_LINE = /^grant(?:\/donation)?-funded spend removed \((\d+)%\)$/;
  check("V — every non-exempt sector states the grant in the one shared sentence, at the rate applied",
    SHARED.filter(sec => {
      const lines = grantLines(sec);
      const m = lines.length === 1 ? SHARED_LINE.exec(lines[0]) : null;
      return !(m && m[1] === RATE);
    }), []);
  check("V — no sector, exempt or not, states the grant rate as a share of \"the figure\"",
    REDUCERS.filter(sec => grantLines(sec).some(a => /of the figure/i.test(a))), []);

  /* WHY "OF THE FIGURE" IS WRONG, KEPT AS AN ASSERTION RATHER THAN A COMMENT.
     The grant comes off the spend; a ceiling applied afterwards can stop the
     figure moving at all. If this ever goes red, every reducer's figure has
     started falling by exactly the grant rate under a ceiling — that is a TAX
     change — and the reason for the wording above needs re-reading, not
     muting. The facts are Suite G's B2 case: an earlier entitled owner's
     disposal value of £120,000. */
  const CEILING = { prior_owner_entitled: "no", prior_owner_claimed: "no",
                    earlier_entitled_owner: "yes", earlier_disposal_value: 120000 };
  const notByTheRate = REDUCERS.filter(sec => {
    const c = ENGINES[sec].runEngine(Object.assign(grantState(sec, false), CEILING));
    const g = ENGINES[sec].runEngine(Object.assign(grantState(sec, true), CEILING));
    return !(Math.abs(g.QE[1] - c.QE[1] * (1 - GRANT_FRACTION)) < 1e-6);
  });
  check("V — under a disposal-value ceiling the figure does not fall by the grant rate, so the rate is not \"of the figure\"",
    notByTheRate.length > 0, true);

  /* ...AND ITS SWITCH-ON TWIN. (Phase 113j, board item 13014647417.) The limb
     above asserts TODAY'S order, with CB_CTA.grant_after_ceilings off, and it
     stays exactly as it was. Forced on through liftGated - hoisted by Phase
     113i for exactly this - the grant comes off AFTER the ceiling, so under the
     very same facts every sector that reduces the base DOES fall by exactly the
     grant rate. That is the one reading on which "of the figure" would have been
     true, and it is why limb (4)'s shared sentence must be re-read by whoever
     flips that switch. Both orders are asserted side by side, not one. */
  const byTheRateWhenOn = REDUCERS.filter(sec => {
    const gc1 = liftGated(sec, ["grant_after_ceilings"]);
    const c = gc1.runEngine(Object.assign(grantState(sec, false), CEILING));
    const g = gc1.runEngine(Object.assign(grantState(sec, true), CEILING));
    return !(Math.abs(g.QE[1] - c.QE[1] * (1 - GRANT_FRACTION)) < 1e-6);
  });
  check("V — with the grant-after-ceilings switch forced on, under the same ceiling EVERY sector that reduces the base falls by exactly the grant rate",
    byTheRateWhenOn, []);

  /* The one panel. Matched on its HTML string so the one-line and the braced
     renderer forms both count; the donation limb is the only variation. */
  const PANEL = limb => '<div class="panel grant"><h4>Shown net of the grant</h4>This figure already excludes the ' +
                        limb + '-funded share of the spend \\u2014 that part can\\u2019t also be claimed.</div>';
  check("V — every non-exempt sector shows the one shared panel (the donation limb allowed), and only one",
    SHARED.filter(sec => {
      const t = sectorSource(sec);
      /* count RENDERED panels by their heading tag, not the phrase — a code
         comment that names the panel is not a second panel */
      return t.split("<h4>Shown net of the grant</h4>").length !== 2 ||
             (t.indexOf(PANEL("grant")) === -1 && t.indexOf(PANEL("grant- or donation")) === -1);
    }), []);

  /* (5) PHASE 113i — `grant` MEANS A GRANT WAS DEDUCTED, including under the one
     switch where stating a grant and deducting it come apart. The switch is
     forced on through liftGated, so this runs against the page in site mode and
     against the package's own text in --package mode. */
  const SL_F3 = liftGated("supported_living", ["grant_traced_after_dwelling"]);
  const slClean = ENGINES.supported_living.runEngine(grantState("supported_living", false));
  const f3Untraced = SL_F3.runEngine(grantState("supported_living", true));
  const f3Traced = SL_F3.runEngine(Object.assign(grantState("supported_living", true), { grant_traced_fraction: 0.1 }));
  check("V — F-3 switched on, grant not traced: nothing is deducted and `grant` is false",
    [f3Untraced.QE[1] === slClean.QE[1], f3Untraced.grant], [true, false]);
  check("V — F-3 switched on, grant traced to the claimed areas: it is deducted and `grant` is true",
    [f3Traced.QE[1] < slClean.QE[1], f3Traced.grant], [true, true]);

  /* AND THE FIGURE DID NOT MOVE. Phase 113h was a disclosure fix; the base
     reduction already happened and was not in question. Asserted alongside the
     disclosure so that a future edit cannot quietly buy a nicer screen with a
     changed number: the reduced figure must still be exactly (1 - fraction) of
     the clean one, at both ends, for every sector the rule binds. */
  check("V — disclosure changed nothing: the reduced figure is still exactly the clean one net of the grant",
    REDUCERS.filter(sec => {
      const clean = ENGINES[sec].runEngine(grantState(sec, false));
      const withG = RESULT[sec];
      const near = (a, b) => Math.abs(a - b) < 1e-6;
      return !(near(withG.QE[0], clean.QE[0] * (1 - GRANT_FRACTION)) &&
               near(withG.QE[1], clean.QE[1] * (1 - GRANT_FRACTION)));
    }), []);

  /* WHAT THE INERT LIST IS FOR. Not an assertion — a report. A sector that
     stops reducing the base leaves the REDUCERS list silently, and every
     assertion above would go on passing without it. Printing the split means a
     sector dropping out is visible in the run rather than discovered later. */
  console.log("         sectors that reduce the base for a grant: " +
              (REDUCERS.join(", ") || "none") +
              "  |  sectors that do not: " + (INERT.join(", ") || "none"));
}


/* =============================================================================
   SUITE W - PHASE 129b, 13 September 2026. THE AMENDMENT WINDOW.
   Two things, both about which tax return a claim can still reach.

   (1) Item 13034277722. "Not sure" to "Is the relevant tax return still open
       to amendment?" was stored as false - out of time - in all five flows. So
       a still-owned client who said "not sure" got W2 and a cash figure, where
       a client never asked got neither; and a sold one got W3 where the other
       got no route. N4: the two must behave identically, and BOTH are asserted,
       answer by answer and through each whole flow. The words follow: a window
       that is not known is no longer called "out of time", or "closed".

   (2) Item 13034238993. The window was worked out from the latest year end the
       client gave, not the year the money was spent in. Rulebook A v2 section 4
       settles which: the annual investment allowance and first-year allowances
       are made for the chargeable period in which the expenditure is incurred,
       so that period's return is the one an amendment must reach. Live where it
       can only close a window; behind CB_CTA.window_from_later_spend_period
       where it would open one. Both readings asserted, and both directions.
   ============================================================================= */
if (startSuite("W", "Phase 129b — the amendment window: not sure, and which year")) {

  if (liftError) {
    check("engines lift out of the source", String(liftError), "no error");
  } else {

    const ASK = "Is the relevant tax return still open to amendment?";
    const fq = sec => (ENGINES[sec].Q || []).find(q => q.ask === ASK);
    const TODAY = new Date("2026-09-13T00:00:00Z");
    /* On a copy from before Phase 129b the new functions do not exist; each
       check must then FAIL on its own rather than stop the run. */
    const safe = fn => { try { return fn(); } catch (e) { return "threw: " + e.message; } };
    function windowLayer(on) {
      let layer = layerSrc;
      if (on) layer = layer.replace(/(window_from_later_spend_period\s*:\s*)false/g, "$1true");
      return new Function(layer + "; return { CB_CASH: CB_CASH, CB_CTA: CB_CTA };")();
    }
    const OFF = windowLayer(false), ON = windowLayer(true);

    /* --- AW1: what each flow stores ---------------------------------------- */
    check("AW1 — all five flows still ask the fallback question", SECTORS.filter(sec => !fq(sec)), []);
    SECTORS.forEach(sec => {
      const set = v => { const s = { flags: [] }; fq(sec).onSet(s, v); return s; };
      check("AW1 — " + sec + ": \"not sure\" is stored as unanswered, exactly as a client never asked (N4)",
        ["return_in_time" in set("unsure"), "return_in_time" in {}], [false, false]);
      check("AW1 — " + sec + ": \"in time\" and \"out of time\" still store true and false",
        [set("yes").return_in_time, set("no").return_in_time], [true, false]);
      check("AW1 — " + sec + ": \"not sure\" after an earlier answer clears it rather than keeping it",
        (function(){ const s = { flags: [] }; fq(sec).onSet(s, "no"); fq(sec).onSet(s, "unsure"); return "return_in_time" in s; })(),
        false);
    });

    /* --- AW2: through the whole flow, a window that is not known ------------ */
    function winState(extra) {
      return Object.assign({
        trigger: ["purchase"], deal: "property", base_amount: 2000000,
        claimant_type: "company", activity: "trade",
        dwelling_setting: "institution_commercial", acuity: "normal",
        flags: [], assumptions: [], lrr: false,
        sufficient_profit: "yes", aia_headroom: "unsure"
      }, extra || {});
    }
    const OWN = ["yes", "no", "unsure", undefined];
    const said = r => JSON.stringify([r.cash, r.cashRoute, r.cashBlocked, r.speed, r.assumptions, r.flags]);
    SECTORS.forEach(sec => {
      check("AW2 — " + sec + ": \"not sure\" and no answer give the same route, figure and words, whatever the ownership (N4)",
        OWN.filter(own => {
          const u = winState({ still_own_property: own }); fq(sec).onSet(u, "unsure");
          const a = winState({ still_own_property: own });
          return said(ENGINES[sec].runEngine(u)) !== said(ENGINES[sec].runEngine(a));
        }).map(String), []);
    });

    /* --- AW3: the words ----------------------------------------------------- */
    SECTORS.forEach(sec => {
      const r = ENGINES[sec].runEngine(winState({ still_own_property: "yes" }));
      const outOfTime = ENGINES[sec].runEngine(winState({ still_own_property: "yes", return_in_time: false }));
      check("AW3 — " + sec + ": a window not known is not called out of time, says it is not yet confirmed, and shows no route and no figure",
        [/out of time/.test(r.speed), r.speed.indexOf(CB_CASH.SPEED_WINDOW_UNKNOWN) === 0,
         r.assumptions.some(x => /still open to amendment is not yet confirmed/.test(x)), r.cashRoute, r.cash],
        [false, true, true, null, [null, null]]);
      check("AW3 — " + sec + ": an answer of out of time is still called out of time, on W2",
        [/out of time/.test(outOfTime.speed), outOfTime.cashRoute], [true, "W2"]);
    });
    const sold = extra => CB_CASH.computeCashBenefit(Object.assign({ still_own_property: "no", sufficient_profit: "yes",
      aia_headroom: 500000, pool_split_basis: "measured", claimant_type: "company" }, extra), 1, 2, () => {});
    check("AW3 — a sold property whose window is not known is not told the window has closed",
      [sold({}).route, sold({}).reasons.some(x => /has closed/.test(x)), sold({}).reasons.some(x => /still open is not yet confirmed/.test(x))],
      [null, false, true]);
    check("AW3 — one whose window is known to be closed still is, on W3",
      [sold({ return_in_time: false }).route, sold({ return_in_time: false }).reasons.some(x => /has closed/.test(x))],
      ["W3", true]);

    /* --- AW4: the year the money was spent in -------------------------------- */
    const W = (M, s, day) => M.CB_CASH.deriveAmendmentWindow(s, day || TODAY);
    const wf = w => w.known ? [w.basis, w.periodEnd, w.deadline.toISOString().slice(0, 10), w.inTime] : ["unknown"];
    const SHIPPED = { CB_CASH: CB_CASH };
    check("AW4 — a company that spent the money years before the year end it gives: the year of spend decides, and that return has closed",
      wf(W(SHIPPED, { claimant_type: "company", accounting_period_end: "2026-03-31", event_date: "2021-06-01" })),
      ["period_of_spend", "2022-03-31", "2024-03-31", false]);
    check("AW4 — the year end on its own calls the same client in time, which was the defect",
      (function(){ const w = W(SHIPPED, { claimant_type: "company", accounting_period_end: "2026-03-31" });
        return [w.deadline.toISOString().slice(0, 10), w.inTime]; })(),
      ["2028-03-31", true]);
    check("AW4 — money spent inside the latest year: nothing changes, word for word",
      safe(function(){ const w = W(SHIPPED, { claimant_type: "company", accounting_period_end: "2026-03-31", event_date: "2025-06-01" });
        return [wf(w), CB_CASH.describeWindow({ accounting_period_end: "2026-03-31", event_date: "2025-06-01" }, w)]; }),
      [["year_end_given", "2026-03-31", "2028-03-31", true],
       "amendment window derived from the accounting year end given (2026-03-31): the return is still open to amend (ordinary-case rule of thumb, confirm the exact statutory filing date with your accountant)"]);
    check("AW4 — an individual: the self assessment deadline for the tax year that the year of spend ends in",
      wf(W(SHIPPED, { claimant_type: "individual", accounting_period_end: "2026-03-31", event_date: "2022-09-01" })),
      ["period_of_spend", "2023-03-31", "2025-01-31", false]);
    check("AW4 — a year end on the day of spend is that year; the day after is the next; 29 February lands on the 28th in a common year",
      safe(() => [CB_CASH.spendPeriodEnd("2025-12-31", "2023-12-31"), CB_CASH.spendPeriodEnd("2025-12-31", "2024-01-01"),
       CB_CASH.spendPeriodEnd("2024-02-29", "2022-06-01")]),
      ["2023-12-31", "2024-12-31", "2023-02-28"]);
    check("AW4 — no completion date, or one that is not a date: the year end given, as before",
      [wf(W(SHIPPED, { claimant_type: "company", accounting_period_end: "2026-03-31" })),
       wf(W(SHIPPED, { claimant_type: "company", accounting_period_end: "2026-03-31", event_date: "sometime in 2021" }))],
      [["year_end_given", "2026-03-31", "2028-03-31", true], ["year_end_given", "2026-03-31", "2028-03-31", true]]);
    check("AW4 — no year end: still not known, whatever the completion date (N4)",
      [wf(W(SHIPPED, { claimant_type: "company", event_date: "2021-06-01" })), wf(W(SHIPPED, { claimant_type: "company" }))],
      [["unknown"], ["unknown"]]);
    check("AW4 — the client is told which year it was worked out for, and what that rests on",
      safe(function(){ const s = { claimant_type: "company", accounting_period_end: "2026-03-31", event_date: "2021-06-01" };
        const t = CB_CASH.describeWindow(s, W(SHIPPED, s));
        return [/accounting year the money was spent in, ending 2022-03-31/.test(t), /twelve-month accounting years/.test(t), /no longer open to amend/.test(t)]; }),
      [true, true, true]);

    /* --- AW5: which way it moves, as shipped --------------------------------- */
    const grid = [];
    ["company", "individual"].forEach(who =>
      ["2019-03-31", "2023-12-31", "2026-03-31", "2027-06-30"].forEach(ape =>
        ["2015-05-01", "2020-01-15", "2023-12-31", "2024-01-01", "2025-09-30", "2026-08-01", "2028-02-29"].forEach(sp =>
          ["2021-01-01", "2024-06-30", "2026-09-13", "2029-03-31"].forEach(day =>
            grid.push({ s: { claimant_type: who, accounting_period_end: ape, event_date: sp }, day: new Date(day + "T00:00:00Z") })))));
    const yearEndAlone = (M, g) => W(M, { claimant_type: g.s.claimant_type, accounting_period_end: g.s.accounting_period_end }, g.day);
    check("AW5 — over " + grid.length + " states, as shipped the year of spend never opens a window the year end given had closed",
      grid.filter(g => !yearEndAlone(OFF, g).inTime && W(OFF, g.s, g.day).inTime).length, 0);
    check("AW5 — and it does close some, so the correction is not inert",
      grid.filter(g => yearEndAlone(OFF, g).inTime && !W(OFF, g.s, g.day).inTime).length > 0, true);

    /* --- AW6: the switch, both ways ------------------------------------------ */
    const STALE = { claimant_type: "company", accounting_period_end: "2019-03-31", event_date: "2025-06-01" };
    check("AW6 — the switch ships OFF", OFF.CB_CTA.window_from_later_spend_period, false);
    check("AW6 branch B — off, money spent after a year end long gone: the year end given still decides, and calls it closed",
      wf(W(OFF, STALE)), ["year_end_given", "2019-03-31", "2021-03-31", false]);
    check("AW6 branch A — on, the year the money was spent in decides there too, and opens it: money moves UP",
      wf(W(ON, STALE)), ["period_of_spend", "2026-03-31", "2028-03-31", true]);
    check("AW6 branch A — on, every state it changes is money spent after the year end given, moved to a later year",
      grid.filter(g => { const a = W(OFF, g.s, g.day), b = W(ON, g.s, g.day);
        return JSON.stringify(wf(a)) !== JSON.stringify(wf(b))
          && !(g.s.event_date > g.s.accounting_period_end && b.periodEnd > a.periodEnd); }).length, 0);
    check("AW6 branch A — on, it never closes a window that off had open",
      grid.filter(g => W(OFF, g.s, g.day).inTime && !W(ON, g.s, g.day).inTime).length, 0);

    /* --- AW7: through all five flows ------------------------------------------ */
    SECTORS.forEach(sec => {
      const early = ENGINES[sec].runEngine(winState({ still_own_property: "yes", accounting_period_end: "2030-03-31", event_date: "2021-06-01" }));
      const inYear = ENGINES[sec].runEngine(winState({ still_own_property: "yes", accounting_period_end: "2030-03-31", event_date: "2029-06-01" }));
      check("AW7 — " + sec + ": money spent in 2021, year end given 2030: no refund route (W2, not W1), and the sentence names the year it was spent in",
        [early.cashRoute, early.assumptions.some(x => /the accounting year the money was spent in, ending 2022-03-31/.test(x)), /refund from HMRC/.test(early.speed)],
        ["W2", true, false]);
      check("AW7 — " + sec + ": money spent inside the year ending then is still W1, with the sentence it always had",
        [inYear.cashRoute, inYear.assumptions.some(x => /^amendment window derived from the accounting year end given \(2030-03-31\): the return is still open to amend/.test(x))],
        ["W1", true]);
    });
  }
}


/* =============================================================================
   SUITE X - PHASE 132, 14 September 2026. FOUR PREPARED READINGS AND TWO LIVE
   CORRECTIONS, EACH ASSERTED BOTH WAYS.

   (1) S33-1, CB_CTA.s33b_aggregation (G-Q3, G-Q4). CAA 2001 s.33B: work on an
       integral feature of more than half its replacement cost - on its own, or
       with further work on the same feature in the 12 months beginning with
       the first, measured at the FIRST date - is a replacement. CB_S33B builds
       it; off, nothing in any flow moves and no question is asked.
   (2) AC-1, CB_CTA.ct_rate_from_associated_companies (I-Q3). The corporation
       tax rate from the associated company count and the taxable profits (CTA
       2010 ss.18B and 18D). An unknown count is never read as none.
   (3) TP-1, CB_CTA.income_tax_taper_band (I-Q2). The effective 60% band ITA
       2007 s.35 creates, at the top of the range, only for a taxpayer KNOWN to
       be in it.
   (4) Line 20. TMA 1970 s.12ABA(4)(b) and s.12AA(5B): a partnership with a
       company partner is on the company date. LIVE where that closes a window;
       CB_CTA.window_company_member_date (AW-2, PT-Q1) where it would open one.
       A partner not known is open only on both dates, closed only on both, and
       otherwise not known - and a fallback "in time" cannot open it (N4).
   (5) The defect. A 29 February period end plus 24 months was 1 March. LIVE.
   ============================================================================= */
if (startSuite("X", "Phase 132 — s.33B, the company rate, the taper band, partnership windows")) {

  if (liftError) {
    check("engines lift out of the source", String(liftError), "no error");
  } else {

    /* On a copy from before Phase 132 the new functions do not exist; each
       check must then FAIL on its own rather than stop the run. */
    const safe = fn => { try { return fn(); } catch (e) { return "threw: " + e.message; } };
    function xLayer(gates) {
      let layer = layerSrc;
      (gates || []).forEach(g => { layer = layer.replace(new RegExp("(" + g + "\\s*:\\s*)false", "g"), "$1true"); });
      return new Function(layer + "; return { CB_S33B: (typeof CB_S33B !== 'undefined') ? CB_S33B : null, CB_RATES: CB_RATES, CB_CASH: CB_CASH, CB_CTA: CB_CTA };")();
    }
    const X_SWITCHES = ["s33b_aggregation", "ct_rate_from_associated_companies", "income_tax_taper_band", "window_company_member_date"];
    const OFF = xLayer([]);
    const S33 = xLayer(["s33b_aggregation"]), AC = xLayer(["ct_rate_from_associated_companies"]),
          TP = xLayer(["income_tax_taper_band"]), AW = xLayer(["window_company_member_date"]);
    const lifted = {};
    const flow = (sec, gates) => {
      if (!gates || !gates.length) return ENGINES[sec];
      const k = sec + "|" + gates.join(",");
      return lifted[k] || (lifted[k] = liftGated(sec, gates));
    };
    const qOf = (E, id) => (E.Q || []).find(q => q.id === id);
    const PREFIX = { care_homes: "Q", dental: "D", supported_living: "S", gp: "G", private_hospital: "H" };
    function xState(extra) {
      return Object.assign({
        trigger: ["purchase"], deal: "property", base_amount: 2000000,
        claimant_type: "company", activity: "trade",
        dwelling_setting: "institution_commercial", acuity: "normal",
        flags: [], assumptions: [], lrr: false,
        sufficient_profit: "yes", aia_headroom: "unsure", still_own_property: "yes"
      }, extra || {});
    }
    const face = r => JSON.stringify([r.QE, r.TS, r.cash, r.cashRoute, r.cashBlocked, r.speed, r.assumptions, r.flags, r.pool, r.outcome]);
    const near = (a, b) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 1e-6;
    const iso = d => d.toISOString().slice(0, 10);
    const S33_FACTS = { s33b_feature: "electrical", s33b_first_date: "2025-01-10", s33b_first_amount: 30000,
      s33b_replacement_cost: 100000, s33b_more_work: "yes", s33b_same_feature: true,
      s33b_second_date: "2025-09-10", s33b_second_amount: 30000 };
    const AC_FACTS = { associated_companies: 3, taxable_profits: 100000 };

    /* --- X1: the switches ship off, and off nothing moves -------------------- */
    check("X1 — the four Phase 132 switches ship OFF", X_SWITCHES.map(k => OFF.CB_CTA[k]), [false, false, false, false]);
    SECTORS.forEach(sec => {
      const co = extra => xState(Object.assign({ accounting_period_end: "2026-03-31" }, extra));
      const st = extra => xState(Object.assign({ claimant_type: "sole_trader", accounting_period_end: "2026-03-31" }, extra));
      check("X1 branch B — " + sec + ": off, a company carrying every switched fact gets byte for byte what one carrying none gets",
        face(ENGINES[sec].runEngine(co(Object.assign({}, S33_FACTS, AC_FACTS)))) === face(ENGINES[sec].runEngine(co())), true);
      check("X1 branch B — " + sec + ": off, a sole trader known to be in the taper band gets byte for byte the shipped figure and words",
        face(ENGINES[sec].runEngine(st(Object.assign({}, S33_FACTS, { taper_band: true })))) === face(ENGINES[sec].runEngine(st())), true);
    });
    const Q_CO = { trigger: ["purchase"], claimant_type: "company", s33b_feature: "electrical", s33b_more_work: "yes" };
    const Q_IN = Object.assign({}, Q_CO, { claimant_type: "sole_trader" });
    const newQ = (E, st) => (E.Q || []).filter(q => /^[A-Z]51(s33|assoc|profit|ani)/.test(q.id) && q.showIf && q.showIf(st)).map(q => q.id.slice(1));
    const S33_IDS = ["51s33f", "51s33d1", "51s33a1", "51s33rc", "51s33more", "51s33same", "51s33d2", "51s33a2", "51s33rep"];
    SECTORS.forEach(sec => {
      check("X1 branch B — " + sec + ": off, no Phase 132 question is put to a company or a sole trader",
        [newQ(ENGINES[sec], Q_CO), newQ(ENGINES[sec], Q_IN)], [[], []]);
      check("X1 branch A — " + sec + ": S33-1 on asks about the integral-feature work, and nothing else",
        newQ(flow(sec, ["s33b_aggregation"]), Q_CO), S33_IDS);
      check("X1 branch A — " + sec + ": AC-1 on asks a company for the count and the profits, and never a sole trader",
        [newQ(flow(sec, ["ct_rate_from_associated_companies"]), Q_CO), newQ(flow(sec, ["ct_rate_from_associated_companies"]), Q_IN)],
        [["51assoc", "51profit"], []]);
      check("X1 branch A — " + sec + ": TP-1 on asks a sole trader about the band, and never a company",
        [newQ(flow(sec, ["income_tax_taper_band"]), Q_IN), newQ(flow(sec, ["income_tax_taper_band"]), Q_CO)],
        [["51ani"], []]);
    });

    /* --- X2: S33-1, CAA 2001 s.33B ----------------------------------------------- */
    const A33 = f => safe(() => S33.CB_S33B.assess(f));
    const one = (tranches, rc) => [{ feature: "electrical", tranches: tranches, replacement_cost_by_date: rc }];
    const caughtOf = r => (typeof r === "string") ? r : [r.caught, r.features.map(f => f.caught.map(c => c.date + " " + c.rule))];
    check("X2 — s.33B(3) and (4): 30% and then 30% eight months later on the same feature - both caught",
      caughtOf(A33(one([{ date: "2025-01-10", amount: 30000 }, { date: "2025-09-10", amount: 30000 }], { "2025-01-10": 100000 }))),
      [60000, [["2025-01-10 s.33B(4)", "2025-09-10 s.33B(4)"]]]);
    check("X2 — the same two thirteen months apart: neither is caught",
      caughtOf(A33(one([{ date: "2025-01-10", amount: 30000 }, { date: "2026-02-10", amount: 30000 }], { "2025-01-10": 100000, "2026-02-10": 100000 }))),
      [0, [[]]]);
    check("X2 — the 12 months begin with the first spend: the day before its anniversary is inside, the anniversary is not",
      [safe(() => S33.CB_S33B.assess(one([{ date: "2025-01-10", amount: 30000 }, { date: "2026-01-09", amount: 30000 }], { "2025-01-10": 100000 })).caught),
       safe(() => S33.CB_S33B.assess(one([{ date: "2025-01-10", amount: 30000 }, { date: "2026-01-10", amount: 30000 }], { "2025-01-10": 100000 })).caught)],
      [60000, 0]);
    check("X2 — measured against the replacement cost at the FIRST date, not the later one",
      [safe(() => S33.CB_S33B.assess(one([{ date: "2025-01-10", amount: 30000 }, { date: "2025-06-10", amount: 34000 }], { "2025-01-10": 130000, "2025-06-10": 100000 })).caught),
       safe(() => S33.CB_S33B.assess(one([{ date: "2025-01-10", amount: 30000 }, { date: "2025-06-10", amount: 34000 }], { "2025-01-10": 100000, "2025-06-10": 130000 })).caught)],
      [0, 64000]);
    check("X2 — s.33B(2): a single spend of more than half the replacement cost is caught on its own",
      caughtOf(A33(one([{ date: "2025-03-01", amount: 60000 }], { "2025-03-01": 100000 }))), [60000, [["2025-03-01 s.33B(2)"]]]);
    check("X2 — exactly half is not more than half",
      safe(() => S33.CB_S33B.assess(one([{ date: "2025-03-01", amount: 50000 }], { "2025-03-01": 100000 })).caught), 0);
    check("X2 N4 — no replacement cost at the first date: no window measured from it passes, however large the total",
      safe(() => S33.CB_S33B.assess(one([{ date: "2025-01-10", amount: 40000 }, { date: "2025-02-10", amount: 40000 }], { "2025-02-10": 100000 })).caught), 0);
    check("X2 N4 — a spend with no date, or no cost, is left out and says why; it never counts towards the total",
      safe(() => { const r = S33.CB_S33B.assess(one([{ date: "2025-01-10", amount: 30000 }, { amount: 30000 }, { date: "2025-05-01" }, { date: "sometime", amount: 30000 }], { "2025-01-10": 100000 }));
        return [r.caught, r.features[0].leftOut.map(x => x.why)]; }),
      [0, ["its date is not known", "its cost is not known", "its date is not known"]]);
    check("X2 N4 — s.33B(5): deducted as a repair raises the adjustment, a known no does not, and not known still does",
      [true, false, null, undefined].map(rep => safe(() => S33.CB_S33B.assess(one([{ date: "2025-03-01", amount: 60000, deducted_as_repair: rep }], { "2025-03-01": 100000 })).repairAdjustment)),
      [true, false, true, true]);
    const S33_STATE = extra => xState(Object.assign({ accounting_period_end: "2026-03-31" }, S33_FACTS, extra));
    SECTORS.forEach(sec => {
      const E = flow(sec, ["s33b_aggregation"]);
      const off = ENGINES[sec].runEngine(S33_STATE());
      check("X2 branch A — " + sec + ": on, both tranches are caught, qualifying expenditure rises by exactly their £60,000, flagged, and the s.33B(5) adjustment is raised on a repair position not known",
        safe(() => { const on = E.runEngine(S33_STATE());
          return [near(on.QE[1] - off.QE[1], 60000), near(on.QE[0] - off.QE[0], 60000),
                  on.flags.some(f => /s\.33B REPLACEMENT APPLIED \(S33-1\)/.test(f)), on.flags.some(f => /s\.33B\(5\) ADJUSTMENT/.test(f))]; }),
        [true, true, true, true]);
      check("X2 branch A — " + sec + ": on, the caught spend goes into the special-rate pool whole, and the main pool does not move",
        safe(() => { const m = { sr_share_lo: 0.3, sr_share_hi: 0.3 };
          const a = E.runEngine(S33_STATE(m)), b = E.runEngine(xState(Object.assign({ accounting_period_end: "2026-03-31" }, m)));
          return [near(a.pool.special[0] - b.pool.special[0], 60000), near(a.pool.special[1] - b.pool.special[1], 60000), near(a.pool.main[1], b.pool.main[1])]; }),
        [true, true, true]);
      check("X2 N4 — " + sec + ": later work \"not sure\" to be on the same system and no answer give the same figure and words, and neither is added to the first",
        safe(() => { const u = S33_STATE(); qOf(E, PREFIX[sec] + "51s33same").onSet(u, "unsure");
          const a = S33_STATE(); delete a.s33b_same_feature;
          const ru = E.runEngine(u), ra = E.runEngine(a);
          return [face(ru) === face(ra), near(ru.QE[1], off.QE[1])]; }),
        [true, true]);
      check("X2 N4 — " + sec + ": a replacement cost left blank and one never given are the same, and nothing is added",
        safe(() => { const u = S33_STATE(); qOf(E, PREFIX[sec] + "51s33rc").onSet(u, 0);
          const a = S33_STATE(); delete a.s33b_replacement_cost;
          const ru = E.runEngine(u), ra = E.runEngine(a);
          return [face(ru) === face(ra), near(ru.QE[1], off.QE[1])]; }),
        [true, true]);
      check("X2 N4 — " + sec + ": the system \"not sure\" and never answered are the same, and nothing is added",
        safe(() => { const u = S33_STATE(); qOf(E, PREFIX[sec] + "51s33f").onSet(u, "unsure");
          const a = S33_STATE(); delete a.s33b_feature;
          const ru = E.runEngine(u), ra = E.runEngine(a);
          return [face(ru) === face(ra), near(ru.QE[1], off.QE[1])]; }),
        [true, true]);
    });

    /* --- X3: AC-1, the company rate ------------------------------------------------ */
    const round4 = v => Array.isArray(v) ? v.map(x => Math.round(x * 10000) / 10000) : v;
    const CR = (s, a, b) => round4(safe(() => AC.CB_RATES.companyRange(Object.assign({ accounting_period_end: "2026-03-31" }, s), a, b)));
    check("X3 — on, count 0 and profits of £100,000: 26.5%, in the marginal band", CR({ associated_companies: 0, taxable_profits: 100000 }), [0.265, 0.265]);
    check("X3 — on, count 3 and profits of £100,000: 25%, above an upper limit of £62,500", CR({ associated_companies: 3, taxable_profits: 100000 }), [0.25, 0.25]);
    check("X3 — on, count 1 and profits of £40,000: 26.5%, above a lower limit of £25,000", CR({ associated_companies: 1, taxable_profits: 40000 }), [0.265, 0.265]);
    check("X3 — on, count 0 and profits of £30,000: 19%", CR({ associated_companies: 0, taxable_profits: 30000 }), [0.19, 0.19]);
    check("X3 — on, an allowance of £20,000 against £60,000 of profits crosses the £50,000 limit: £4,550 of tax, 22.75%, band by band",
      CR({ associated_companies: 0, taxable_profits: 60000 }, 20000, 20000), [0.2275, 0.2275]);
    check("X3 — on, a six-month accounting period reduces both limits: £40,000 of profits moves from 19% into the marginal band",
      [CR({ associated_companies: 0, taxable_profits: 40000, accounting_period_start: "2025-10-01" }), CR({ associated_companies: 0, taxable_profits: 40000 })],
      [[0.265, 0.265], [0.19, 0.19]]);
    check("X3 — on, a period starting before 1 April 2023 is not narrowed",
      round4(safe(() => AC.CB_RATES.companyRange({ associated_companies: 0, taxable_profits: 30000, accounting_period_end: "2023-03-31" }))), [0.19, 0.265]);
    check("X3 branch B — off, the same facts leave the shipped range - the same array",
      safe(() => OFF.CB_RATES.companyRange({ associated_companies: 0, taxable_profits: 30000, accounting_period_end: "2026-03-31" }) === OFF.CB_RATES.MARGINAL_RATE.company), true);
    const ACF = flow("care_homes", ["ct_rate_from_associated_companies"]);
    check("X3 N4 — the count \"not sure\", \"10 or more\", and a count cleared by \"not sure\" store nothing; profits left blank store nothing",
      safe(() => { const qa = qOf(ACF, "Q51assoc"), qp = qOf(ACF, "Q51profit");
        const s1 = { flags: [] }, s2 = { flags: [] }, s3 = { flags: [] }, s4 = { flags: [] }, s5 = { flags: [] };
        qa.onSet(s1, "unsure"); qa.onSet(s2, "10plus"); qp.onSet(s3, null); qp.onSet(s4, undefined); qa.onSet(s5, "3"); qa.onSet(s5, "unsure");
        return ["associated_companies" in s1, "associated_companies" in s2, "taxable_profits" in s3, "taxable_profits" in s4, "associated_companies" in s5]; }),
      [false, false, false, false, false]);
    [40000, 200000].forEach(P => {
      check("X3 N4 — on, profits of £" + P + ": a count never given and a count \"not sure\" give the unchanged range, which is not the count-0 answer",
        safe(() => { const u = { taxable_profits: P, accounting_period_end: "2026-03-31", flags: [] }; qOf(ACF, "Q51assoc").onSet(u, "unsure");
          return [CR({ taxable_profits: P }), round4(AC.CB_RATES.companyRange(u)),
                  JSON.stringify(CR({ taxable_profits: P })) !== JSON.stringify(CR({ taxable_profits: P, associated_companies: 0 }))]; }),
        [[0.19, 0.265], [0.19, 0.265], true]);
    });
    check("X3 N4 — on, a count without profits, or profits without a count, leaves the range as shipped",
      [CR({ associated_companies: 2 }), CR({ taxable_profits: 100000 })], [[0.19, 0.265], [0.19, 0.265]]);
    check("X3 — on, the sentence states the count, the limits, s.18D, the augmented-profits assumption and the twelve-month assumption; with profits missing it says so; off it is the shipped sentence",
      safe(() => {
        const est = AC.CB_RATES.describe("company", null, { associated_companies: 1, taxable_profits: 40000, accounting_period_end: "2026-03-31" });
        const miss = AC.CB_RATES.describe("company", null, { associated_companies: 2, accounting_period_end: "2026-03-31" });
        return [/1 associated company/.test(est), /£25,000 and £125,000/.test(est), /s\.18D/.test(est), /augmented profits/.test(est), /twelve months/.test(est),
                /count is 2/.test(miss), /taxable profits are not established/.test(miss),
                OFF.CB_RATES.describe("company", null, { associated_companies: 1, taxable_profits: 40000 }) === OFF.CB_RATES.describe("company", null)];
      }), [true, true, true, true, true, true, true, true]);
    SECTORS.forEach(sec => {
      const E = flow(sec, ["ct_rate_from_associated_companies"]);
      check("X3 branch A — " + sec + ": on, a company with a count and profits is valued at the tax the allowance takes off; one with neither keeps the shipped figure",
        safe(() => {
          const r = E.runEngine(xState(Object.assign({ accounting_period_end: "2026-03-31" }, AC_FACTS)));
          const P = 100000, L = 12500, U = 62500;
          const ct = p => p <= L ? 0.19 * p : (p <= U ? 0.25 * p - 0.015 * (U - p) : 0.25 * p);
          const saved = x => ct(P) - ct(Math.max(0, P - x));
          const bare = E.runEngine(xState({ accounting_period_end: "2026-03-31" }));
          const shipped = ENGINES[sec].runEngine(xState({ accounting_period_end: "2026-03-31" }));
          return [near(r.TS[0], saved(r.QE[0])), near(r.TS[1], saved(r.QE[1])), JSON.stringify(bare.TS) === JSON.stringify(shipped.TS)];
        }), [true, true, true]);
    });

    /* --- X4: TP-1, the taper band ---------------------------------------------------- */
    const UH = (s, key, year, q) => safe(() => TP.CB_RATES.unincHigh(s, key, year, q));
    const TPF = flow("care_homes", ["income_tax_taper_band"]);
    check("X4 — on, rUK, in the band: £20,000 of allowances saves £12,000 at the top of the range", near(UH({ taper_band: true }, "uninc_ruk", "2026-27", 20000), 12000), true);
    check("X4 — on, rUK, in the band: £1m saves £15,084 on the first £25,140 and £389,944 on the rest",
      near(UH({ taper_band: true }, "uninc_ruk", "2026-27", 1000000), 15084 + 389944), true);
    check("X4 — on, Scotland 2026-27: the effective 67.5% on the first £25,140 and the 45% advanced rate on the rest",
      [near(UH({ taper_band: true }, "uninc_scot", "2026-27", 20000), 13500), near(UH({ taper_band: true }, "uninc_scot", "2026-27", 1000000), 0.675 * 25140 + 0.45 * 974860)],
      [true, true]);
    check("X4 — on, \"below\" and \"above\" the band store false and keep the shipped 45%",
      safe(() => { const q = qOf(TPF, "Q51ani"); const b = { flags: [] }, a = { flags: [] };
        q.onSet(b, "below"); q.onSet(a, "above");
        return [b.taper_band, a.taper_band, near(TP.CB_RATES.unincHigh(a, "uninc_ruk", "2026-27", 1000000), 450000)]; }),
      [false, false, true]);
    check("X4 N4 — on, \"not sure\", \"partners differ\" and never answered store nothing and keep 45% (48% in Scotland) and the shipped sentence, never 60%",
      safe(() => { const q = qOf(TPF, "Q51ani"); const u = { flags: [] }, d = { flags: [] }, x = { flags: [] };
        q.onSet(u, "unsure"); q.onSet(d, "differ"); q.onSet(x, "yes"); q.onSet(x, "unsure");
        return [["taper_band" in u, "taper_band" in d, "taper_band" in x],
          [u, d, {}].map(s => Math.round(TP.CB_RATES.unincHigh(s, "uninc_ruk", "2026-27", 20000))),
          [u, {}].map(s => Math.round(TP.CB_RATES.unincHigh(s, "uninc_scot", "2026-27", 20000))),
          TP.CB_RATES.describe("uninc_ruk", null, u) === OFF.CB_RATES.describe("uninc_ruk", null)]; }),
      [[false, false, false], [9000, 9000, 9000], [9600, 9600], true]);
    check("X4 branch B — off, a taxpayer known to be in the band still gets the shipped 45%",
      safe(() => near(OFF.CB_RATES.unincHigh({ taper_band: true }, "uninc_ruk", "2026-27", 20000), 9000)), true);
    check("X4 N4 — on, Scotland in a tax year the table does not hold keeps the shipped 48%",
      safe(() => near(TP.CB_RATES.unincHigh({ taper_band: true }, "uninc_scot", "2019-20", 20000), 9600)), true);
    check("X4 — the tax year a period end falls in: 5 April is the old year, 6 April the new",
      safe(() => ["2026-03-31", "2026-04-05", "2026-04-06", "nonsense"].map(v => TP.CB_RATES.taxYearOf(v))), ["2025-26", "2025-26", "2026-27", null]);
    SECTORS.forEach(sec => {
      const E = flow(sec, ["income_tax_taper_band"]);
      const st = extra => xState(Object.assign({ claimant_type: "sole_trader", accounting_period_end: "2026-03-31" }, extra));
      check("X4 branch A — " + sec + ": on, a sole trader known to be in the band: the top of the range is 60% on the first £25,140 and 40% on the rest, and the sentence says so",
        safe(() => { const r = E.runEngine(st({ taper_band: true })); const q = r.QE[1];
          return [near(r.TS[1], 0.6 * Math.min(q, 25140) + 0.4 * Math.max(0, q - 25140)), r.assumptions.some(a => /effective 60%/.test(a))]; }),
        [true, true]);
      check("X4 N4 — " + sec + ": on, \"not sure\" and never answered give the same figure and words, and they are the shipped ones",
        safe(() => { const u = st({}); qOf(E, PREFIX[sec] + "51ani").onSet(u, "unsure");
          return [face(E.runEngine(u)) === face(E.runEngine(st({}))), face(E.runEngine(st({}))) === face(ENGINES[sec].runEngine(st({})))]; }),
        [true, true]);
    });

    /* --- X5: line 20, a partnership with a company partner ------------------------------ */
    const W = (M, s, day) => M.CB_CASH.deriveAmendmentWindow(s, day);
    const wOf = w => w.known ? [w.deadline ? iso(w.deadline) : null, w.inTime] : [w.ambiguous === true ? "ambiguous" : "unknown"];
    const P = (extra, pe) => Object.assign({ claimant_type: "partnership", accounting_period_end: pe }, extra);
    const earlyCo = pe => pe.slice(5) >= "04-06" || pe.slice(5) <= "01-30";
    const lateCo = pe => pe.slice(5) >= "02-01" && pe.slice(5) <= "04-05";
    const grid = [];
    for (let t = Date.UTC(2024, 0, 1); t <= Date.UTC(2024, 11, 31); t += 86400000) {
      const pe = iso(new Date(t));
      const days = [];
      for (let y = 2025; y <= 2028; y++) for (let m = 0; m < 12; m++) days.push(new Date(Date.UTC(y, m, 15)));
      [CB_CASH.saDeadline(pe), CB_CASH.ctDeadline(pe)].forEach(d => { if (d) { days.push(d); days.push(new Date(d.getTime() + 86400000)); } });
      days.forEach(day => grid.push({ pe, day }));
    }
    const yesOff = g => W(OFF, P({ partnership_has_company_member: true }, g.pe), g.day);
    const noOff = g => W(OFF, P({ partnership_has_company_member: false }, g.pe), g.day);
    const yesOn = g => W(AW, P({ partnership_has_company_member: true }, g.pe), g.day);
    const closedByYes = grid.filter(g => noOff(g).inTime && !yesOff(g).inTime);
    check("X5 — over " + grid.length + " states (every period end in 2024 against four years of days and each deadline), as shipped a KNOWN company partner never opens a window the individual date had closed",
      grid.filter(g => !noOff(g).inTime && yesOff(g).inTime).length, 0);
    check("X5 — and it does close some, every one a period end from 6 April to 30 January",
      [closedByYes.length > 0, closedByYes.every(g => earlyCo(g.pe))], [true, true]);
    check("X5 — a KNOWN \"no\" is the individual date, exactly as every partnership had before",
      grid.filter(g => JSON.stringify(noOff(g)) !== JSON.stringify(W(OFF, { claimant_type: "individual", accounting_period_end: g.pe }, g.day))).length, 0);
    check("X5 — 31 December 2024, company partner, on 15 January 2027: closed on 31 December 2026, where the individual date kept it open to 31 January 2027",
      [wOf(yesOff({ pe: "2024-12-31", day: new Date("2027-01-15T00:00:00Z") })), wOf(noOff({ pe: "2024-12-31", day: new Date("2027-01-15T00:00:00Z") }))],
      [["2026-12-31", false], ["2027-01-31", true]]);
    const changedByOn = grid.filter(g => JSON.stringify(wOf(yesOff(g))) !== JSON.stringify(wOf(yesOn(g))));
    check("X5 AW-2 branch B — the switch ships OFF", OFF.CB_CTA.window_company_member_date, false);
    check("X5 AW-2 branch A — on, it changes only period ends from 1 February to 5 April, never closes a window off had open, and opens some: money moves UP",
      [changedByOn.length > 0, changedByOn.every(g => lateCo(g.pe)),
       grid.filter(g => yesOff(g).inTime && !yesOn(g).inTime).length,
       changedByOn.some(g => !yesOff(g).inTime && yesOn(g).inTime)],
      [true, true, 0, true]);
    check("X5 AW-2 — the usual GP year end, 31 March 2024, company partner, on 15 February 2026: off, the individual date has closed it; on, the company date keeps it open to 31 March 2026",
      [wOf(yesOff({ pe: "2024-03-31", day: new Date("2026-02-15T00:00:00Z") })), wOf(yesOn({ pe: "2024-03-31", day: new Date("2026-02-15T00:00:00Z") }))],
      [["2026-01-31", false], ["2026-03-31", true]]);
    check("X5 N4 — a partner NOT KNOWN, over every state: open only where open on both dates, closed only where closed on both, otherwise not known and marked ambiguous",
      grid.filter(g => {
        const sa = noOff(g).inTime, co = yesOn(g).inTime, u = W(OFF, P({}, g.pe), g.day);
        const want = (sa && co) ? [true, true] : ((!sa && !co) ? [true, false] : ["ambiguous"]);
        const got = u.known ? [true, u.inTime] : [u.ambiguous === true ? "ambiguous" : "unknown"];
        return JSON.stringify(want) !== JSON.stringify(got);
      }).length, 0);
    check("X5 N4 — and some states are ambiguous, so the rule is not inert",
      grid.some(g => W(OFF, P({}, g.pe), g.day).ambiguous === true), true);
    check("X5 — companies, sole traders, individuals and charities read exactly as before whatever partner fact they carry",
      grid.filter((g, i) => i % 7 === 0 && ["company", "sole_trader", "individual", "charity"].some(ct => [true, false].some(m =>
        JSON.stringify(W(OFF, { claimant_type: ct, accounting_period_end: g.pe, partnership_has_company_member: m }, g.day)) !==
        JSON.stringify(W(OFF, { claimant_type: ct, accounting_period_end: g.pe }, g.day))))).length, 0);
    check("X5 — the sentence: a company partner cites s.12AA(5B) and says (5C) is not assumed; a later company date not applied says it is unsettled; a known \"no\" is the shipped sentence word for word",
      safe(() => {
        const d1 = new Date("2027-01-15T00:00:00Z"), d2 = new Date("2026-02-15T00:00:00Z");
        const y = P({ partnership_has_company_member: true }, "2024-12-31"), l = P({ partnership_has_company_member: true }, "2024-03-31"), n = P({ partnership_has_company_member: false }, "2024-12-31");
        const ty = CB_CASH.describeWindow(y, W(OFF, y, d1)), tl = CB_CASH.describeWindow(l, W(OFF, l, d2)), tn = CB_CASH.describeWindow(n, W(OFF, n, d1));
        return [/s\.12AA\(5B\)/.test(ty), /s\.12AA\(5C\)/.test(ty) && /not assumed/.test(ty), /not yet settled/.test(tl),
                tn === "amendment window derived from the accounting year end given (2024-12-31): the return is still open to amend (ordinary-case rule of thumb, confirm the exact statutory filing date with your accountant)"];
      }), [true, true, true, true]);

    SECTORS.forEach(sec => {
      const q = qOf(ENGINES[sec], PREFIX[sec] + "cmem");
      check("X5 — " + sec + ": asks \"Is any partner or LLP member a company?\" of a partnership and an LLP only, and stores yes, no, and \"not sure\" as nothing",
        safe(() => {
          const shown = ["partnership", "llp", "company", "sole_trader", "charity", undefined].map(ct => !!(q.showIf && q.showIf({ claimant_type: ct })));
          const set = v => { const s = { flags: [] }; q.onSet(s, v); return s; };
          const cleared = (function () { const s = { flags: [] }; q.onSet(s, "yes"); q.onSet(s, "unsure"); return "partnership_has_company_member" in s; })();
          return [q.ask, shown, set("yes").partnership_has_company_member, set("no").partnership_has_company_member, "partnership_has_company_member" in set("unsure"), cleared];
        }),
        ["Is any partner or LLP member a company?", [true, true, false, false, false, false], true, false, false, false]);
    });

    /* Through the five flows, which read the real clock: a period end whose
       window is open on one filing date and shut on the other TODAY. */
    const NOW = Date.now();
    const exactlyOneOpen = (pe, earlierCompany) => {
      const co = CB_CASH.ctDeadline(pe), sa = CB_CASH.saDeadline(pe);
      if (!co || !sa) return false;
      return earlierCompany ? (co.getTime() + 2 * 86400000 < NOW && NOW + 2 * 86400000 <= sa.getTime())
                            : (sa.getTime() + 2 * 86400000 < NOW && NOW + 2 * 86400000 <= co.getTime());
    };
    const AMBIG_PE = (function () {
      for (const early of [true, false])
        for (let k = 0; k < 900; k++) {
          const pe = iso(new Date(NOW - (700 + k) * 86400000));
          if (exactlyOneOpen(pe, early)) return pe;
        }
      return null;
    })();
    SECTORS.forEach(sec => {
      const E = ENGINES[sec];
      const st = extra => xState(Object.assign({ claimant_type: "partnership", accounting_period_end: AMBIG_PE }, extra));
      check("X5 N4 — " + sec + ": a partnership window open on one filing date and shut on the other today: \"not sure\" and no answer give the same route, figure and words - no route, no figure, and a sentence saying why",
        safe(() => {
          const u = st({}); qOf(E, PREFIX[sec] + "cmem").onSet(u, "unsure");
          const ru = E.runEngine(u), ra = E.runEngine(st({}));
          return [face(ru) === face(ra), ra.cashRoute, ra.cash, ra.speed.indexOf(CB_CASH.SPEED_WINDOW_UNKNOWN) === 0,
                  ra.assumptions.some(x => /turns on whether any partner or LLP member is a company/.test(x))];
        }), [true, null, [null, null], true, true]);
      check("X5 N4 — " + sec + ": a fallback \"in time\" answer cannot open that window: no refund route and no refund words",
        safe(() => { const r = E.runEngine(st({ return_in_time: true }));
          return [r.cashRoute, /refund from HMRC/.test(r.speed), r.speed.indexOf(CB_CASH.SPEED_WINDOW_UNKNOWN) === 0]; }),
        [null, false, true]);
      check("X5 — " + sec + ": the same partnership known to have a company partner is on the earlier of the two dates, and known to have none on the individual date",
        safe(() => {
          const co = CB_CASH.ctDeadline(AMBIG_PE), sa = CB_CASH.saDeadline(AMBIG_PE);
          const yesOpen = (co.getTime() <= sa.getTime() ? co : sa).getTime() >= NOW, noOpen = sa.getTime() >= NOW;
          const ry = E.runEngine(st({ partnership_has_company_member: true })), rn = E.runEngine(st({ partnership_has_company_member: false }));
          return [ry.cashRoute === (yesOpen ? "W1" : "W2"), rn.cashRoute === (noOpen ? "W1" : "W2"), ry.assumptions.some(x => /s\.12AA\(5B\)/.test(x))];
        }), [true, true, true]);
      check("X5 — " + sec + ": a company and a sole trader carrying a company-partner answer get byte for byte what they get without one",
        ["company", "sole_trader"].every(ct => face(E.runEngine(xState({ claimant_type: ct, accounting_period_end: AMBIG_PE, partnership_has_company_member: true }))) ===
                                                face(E.runEngine(xState({ claimant_type: ct, accounting_period_end: AMBIG_PE })))), true);
    });
    check("X5 N4 — CB_CASH: a sold property on that ambiguous window with a fallback \"in time\" gets no route, no refund and no figure",
      safe(() => { const r = CB_CASH.computeCashBenefit({ claimant_type: "partnership", accounting_period_end: AMBIG_PE, still_own_property: "no", return_in_time: true,
          sufficient_profit: "yes", aia_headroom: 500000, pool_split_basis: "measured" }, 1, 2, () => {});
        return [r.route, r.refundEligible, r.cash]; }), [null, false, [null, null]]);

    /* --- X6: the defect, 29 February ----------------------------------------------------- */
    check("X6 — a 29 February 2024 company period end closes on 28 February 2026, not 1 March: on 1 March 2026 it is out of time",
      safe(() => wOf(CB_CASH.deriveAmendmentWindow({ claimant_type: "company", accounting_period_end: "2024-02-29" }, new Date("2026-03-01T00:00:00Z")))),
      ["2026-02-28", false]);
    check("X6 — the month arithmetic clamps to the last day: 31 August plus 1 and plus 13 months land on 30 September; 31 January plus 1 on 29 February in a leap year and the 28th otherwise; 31 August plus 24 is still 31 August",
      safe(() => [["2024-08-31", 1], ["2024-08-31", 13], ["2024-01-31", 1], ["2023-01-31", 1], ["2024-08-31", 24], ["2024-02-29", 24], ["2024-02-29", 48]]
        .map(a => iso(CB_CASH.addMonths(a[0], a[1])))),
      ["2024-09-30", "2025-09-30", "2024-02-29", "2023-02-28", "2026-08-31", "2026-02-28", "2028-02-29"]);
    check("X6 — a 31 August period end is unchanged, and self assessment for 29 February 2024 is still 31 January 2026",
      safe(() => [iso(CB_CASH.ctDeadline("2024-08-31")), iso(CB_CASH.saDeadline("2024-02-29"))]), ["2026-08-31", "2026-01-31"]);
    check("X6 — s.33B's 12 months from a 29 February spend run to the end of the next February",
      safe(() => S33.CB_S33B.firstDayOutside("2024-02-29")), "2025-03-01");
  }
}


/* =============================================================================
   SUITE Y - PHASE 132, 14 September 2026 (second site builder). N2: THE
   ENGINE'S REGISTRY AGAINST THE PHASE 3 NAME-EXCLUSION POLICY. Line 7, the
   harness half.

   Two lists say which personal names a register may hand us. CB_REGISTRY in
   the site (SOURCES[key].personal and .permitted) is what the engine enforces
   through its own classifyField. NAME_EXCLUSION_POLICY in
   04-phase-work/phase3/caprebate-name-exclusion.ts is the policy the ingestion
   boundary enforces through assertNoUnauthorisedName. Nothing tied them
   together. This suite asserts that every name the engine refuses is refused
   by the policy too, under every policy id its registry key stands for, and
   that the two names the engine permits are the policy's two exceptions.

   THE KEY MAP is the inverse of REGISTRY_ID_OF in
   09-app/backend/src/web/research.ts (read 14 September 2026): CQC and CIW ->
   cqc, CH_COMPANY and CH_PSC -> companies_house, HMLR_PPD and HMLR_TITLE ->
   hmlr, EPC -> epc, VOA -> voa, HOMEDATA_ADDRESS -> homedata.

   RECORDED, NOT FIXED (outside this builder's files):
     - CIW and HOMEDATA_ADDRESS are not policy ids: the policy files Wales
       under CARE_REGULATORS_DEVOLVED and has no address source, so both are
       E_UNKNOWN_SOURCE to it, and the back end's map and the policy disagree;
     - the engine calls the HMLR name "proprietor_name"; the policy's
       exception is "proprietor_name_personal", with proprietorType
       "individual". The bare engine name is UNCLASSIFIED to the policy, so the
       back end must rename it at the boundary. Asserted both ways below;
     - the engine's codes are E_PERSONAL_FIELD_NOT_PERMITTED where the policy
       says E_NAME_FIELD_EXCLUDED.
   FIXED, COMMENT ONLY: the site numbered psc_name "N2 exception 2" and
   proprietor_name "N2 exception 1"; the policy has EXCEPTION_1_PSC_COMMON_
   CONTROL and EXCEPTION_2_HMLR_INDIVIDUAL_PROPRIETOR. The comments now follow
   the policy, and Y7 is the check that fails on a copy from before.

   The module is TypeScript required directly, as Suites J and K require
   theirs: Node strips the types. Where it cannot load, Y0 says so and fails.
   ============================================================================= */
if (startSuite("Y", "Phase 132 — N2, the engine registry against the name-exclusion policy")) {
  let NX = null, nxError = null;
  try { NX = require(P3 + "/caprebate-name-exclusion.ts"); } catch (e) { nxError = e; }
  if (!NX || typeof NX.assertNoUnauthorisedName !== "function") {
    check("Y0 — the Phase 3 name-exclusion module loads", String(nxError || "no assertNoUnauthorisedName export"), "no error");
  } else {
    const POLICY_IDS_OF = { cqc: ["CQC"], companies_house: ["CH_COMPANY", "CH_PSC"], hmlr: ["HMLR_PPD", "HMLR_TITLE"], epc: ["EPC"], voa: ["VOA"] };
    const BACKEND_ONLY_IDS = { cqc: ["CIW"], homedata: ["HOMEDATA_ADDRESS"] };
    const POLICY_FIELD = { HMLR_TITLE: { proprietor_name: "proprietor_name_personal" } };
    const codeOf = (sourceId, field, extra) => {
      try {
        NX.assertNoUnauthorisedName(Object.assign({ sourceId: sourceId, entityId: "suite-y", fields: { [field]: "A Person" } }, extra || {}));
        return "passed";
      } catch (e) {
        return (e && e.name === "NameExclusionError") ? e.code : "threw: " + (e && e.message);
      }
    };
    const SRC = CB_REGISTRY.SOURCES;
    const refusedByEngine = [];
    Object.keys(SRC).forEach(k => (SRC[k].personal || []).forEach(f => {
      if ((SRC[k].permitted || []).indexOf(f) === -1) refusedByEngine.push([k, f]);
    }));
    check("Y1 — the engine refuses personal names on at least five register fields, so Y2 is not vacuous",
      refusedByEngine.length >= 5, true);
    check("Y1 — and every one of them is on a registry key the policy map covers",
      refusedByEngine.filter(([k]) => !POLICY_IDS_OF[k]).map(x => x.join(".")), []);
    const REFUSE = ["E_NAME_FIELD_EXCLUDED", "E_UNCLASSIFIED_FIELD"];
    check("Y2 — every name the engine refuses throws NameExclusionError under every policy id its key stands for (excluded or unclassified)",
      refusedByEngine.reduce((bad, [k, f]) => bad.concat((POLICY_IDS_OF[k] || []).map(id => [id, f, codeOf(id, f)])
        .filter(x => REFUSE.indexOf(x[2]) === -1).map(x => x.join(":"))), []), []);
    check("Y2 — the named examples: an EPC assessor, a CQC registered manager, a Companies House director",
      [codeOf("EPC", "assessor_name"), codeOf("CQC", "registered_manager_name"), codeOf("CH_COMPANY", "director_name")],
      ["E_NAME_FIELD_EXCLUDED", "E_NAME_FIELD_EXCLUDED", "E_NAME_FIELD_EXCLUDED"]);
    check("Y3 — psc_name, which the engine permits, passes under CH_PSC",
      codeOf("CH_PSC", "psc_name"), "passed");
    check("Y4 — the HMLR proprietor's name passes under HMLR_TITLE for an individual, is misapplied for a company, and the engine's bare field name is unclassified to the policy (recorded mismatch)",
      [codeOf("HMLR_TITLE", POLICY_FIELD.HMLR_TITLE.proprietor_name, { proprietorType: "individual" }),
       codeOf("HMLR_TITLE", POLICY_FIELD.HMLR_TITLE.proprietor_name, { proprietorType: "company" }),
       codeOf("HMLR_TITLE", "proprietor_name", { proprietorType: "individual" })],
      ["passed", "E_EXCEPTION_MISAPPLIED", "E_UNCLASSIFIED_FIELD"]);
    check("Y4 — every name the engine permits passes under at least one policy id its key stands for, once the field is named as the policy names it",
      Object.keys(SRC).reduce((bad, k) => bad.concat((SRC[k].permitted || []).filter(f =>
        !(POLICY_IDS_OF[k] || []).some(id => codeOf(id, (POLICY_FIELD[id] || {})[f] || f, { proprietorType: "individual" }) === "passed"))
        .map(f => k + "." + f)), []), []);
    /* AMENDED PHASE 146d, 23 September 2026. This recorded THREE refusals; it now records two and one pass, and
       the change is a gap closing rather than a rule loosening. HOMEDATA_ADDRESS had no entry in the name
       exclusion register at all, so `findPolicy` failed closed on it — correct behaviour, and it meant the paid
       address lookup could not have written a single field. Phase 146d built that lookup and added its entry, so
       its own `postcode` now passes, as it must for the connector to work. CIW still has none, because there is
       no Welsh connector to write anything; an unknown source is still refused outright.
       AMENDED PHASE 155, 4 October 2026: the Welsh regulator IS built now (from its downloaded list), so it has its
       own entry (subitem 16) — the same gap closing as Homedata's. A field it does not keep is still refused: CIW's
       file has no registration status, so `registration_status` is unclassified under CIW and refused; its own
       `capacity` passes. An unknown source is still refused outright. */
    check("Y5 — an unknown source is refused outright; the Welsh regulator now has a policy: a field it does not keep is refused, its own passes; so does the paid address lookup's",
      [codeOf("experian", "anything"), codeOf(BACKEND_ONLY_IDS.cqc[0], "registration_status"), codeOf(BACKEND_ONLY_IDS.cqc[0], "capacity"), codeOf(BACKEND_ONLY_IDS.homedata[0], "postcode")],
      ["E_UNKNOWN_SOURCE", "E_UNCLASSIFIED_FIELD", "passed", "passed"]);
    check("Y6 — an uncatalogued field is refused, never assumed safe",
      [codeOf("HMLR_TITLE", "vendor_solicitor_name"), codeOf("CH_PSC", "director_name")],
      ["E_UNCLASSIFIED_FIELD", "E_UNCLASSIFIED_FIELD"]);
    const exceptionOf = id => {
      const p = (NX.NAME_EXCLUSION_POLICY || []).find(x => x.sourceId === id);
      return p && p.nameExceptions && p.nameExceptions[0] ? p.nameExceptions[0].exceptionId : null;
    };
    /* AMENDED PHASE 132c, 15 September 2026: `permitted` is no longer the last
       property of its source (postSignature follows it, condition CA2), so a
       comma may now sit between the list and its numbering comment. */
    const siteNumber = field => {
      const m = new RegExp('permitted:\\["' + field + '"\\],?\\s*/\\* N2 exception (\\d) \\*/').exec(src);
      return m ? m[1] : null;
    };
    check("Y7 — the site numbers its two permitted names as the policy does: psc_name exception 1, proprietor_name exception 2",
      [siteNumber("psc_name"), /^EXCEPTION_1_/.test(exceptionOf("CH_PSC") || ""), siteNumber("proprietor_name"), /^EXCEPTION_2_/.test(exceptionOf("HMLR_TITLE") || "")],
      ["1", true, "2", true]);
  }
}


/* =============================================================================
   SUITE Z - PHASE 132, 14 September 2026 (second site builder).
     Z1-Z5  LINE 13. The private-hospital v2 cards, item 12840725124, from
            02-modules-and-build-prep/Build-Prep-Private-Hospitals-Clinics-
            Question-Flow-v2.md: H6a H7b H7c(+5 counts) H9m H10d H21a H22 H23.
            CAPTURE ONLY - no figure moves - except H23, where a KNOWN "yes"
            removes the land remediation line (close-only, live). NOT BUILT: the
            H9m range narrowing (no rule specified) and an H22 structures and
            buildings allowance figure (it would be a figure). Q1b, the nation
            card, was already built as H1b and is recorded here.
     Z6     BLANK OPTIONAL ANSWERS (line 10). The five renderers would not
            continue past a blank currency, percent or date box, so "leave it
            blank" could not be done. A question marked optional - its onSet reads
            a blank as not known - may now continue blank and passes null;
            every other question still needs an answer. The renderers are DOM
            code outside the engine package, so like Suite V's panel check this
            reads the site file in both modes.
     Z7     THE PARTNERSHIP PATH (line 20). Can "Is any partner or LLP member a
            company?" be reached? Yes: each flow's own first question keeps a
            partnership or LLP as such. The page's funnel never sets the claimant
            type and never hands one to a sector flow; CB_FRONTDOOR's F5, which
            turns every partnership into "individual", is drawn by neither the
            page nor the back end (whose funnel maps partnership to
            partnership). Recorded, not changed.
   ============================================================================= */
if (startSuite("Z", "Phase 132 — hospital v2 cards, blank optional answers, the partnership path")) {

  if (liftError) {
    check("engines lift out of the source", String(liftError), "no error");
  } else {
    const safe = fn => { try { return fn(); } catch (e) { return "threw: " + e.message; } };
    const PH_E = ENGINES.private_hospital;
    const qH = id => (PH_E.Q || []).find(q => q.id === id);
    const PH_IDS = ["H6a", "H7b", "H7c", "H7ct", "H7ci", "H7cu", "H7cb", "H7cr", "H9m", "H10d", "H21a", "H22", "H23"];
    const PREFIX_Z = { care_homes: "Q", dental: "D", supported_living: "S", gp: "G", private_hospital: "H" };

    /* --- Z1: the cards exist, in this flow only, and follow the house rules --- */
    check("Z1 — every v2 card is in the private-hospital flow", PH_IDS.filter(id => !qH(id)), []);
    check("Z1 — and in no other sector's flow",
      SECTORS.filter(s => s !== "private_hospital").reduce((bad, sec) => bad.concat(PH_IDS.filter(id => (ENGINES[sec].Q || []).some(q => q.id === id)).map(id => sec + ":" + id)), []), []);
    check("Z1 — each is gated by a showIf, carries help of at least 40 characters, and each single choice offers \"not sure\"",
      PH_IDS.filter(id => { const q = qH(id); return !q || typeof q.showIf !== "function" || !q.help || q.help.length < 40 ||
        (q.type === "single" && !(q.opts || []).some(o => o[0] === "unsure")); }), []);
    check("Z1 — H7b is marked for UX review in the source, and H9m and H22 say what was not built",
      [/H7b[\s\S]{0,700}UX REVIEW NEEDED BEFORE GO-LIVE/.test(src), /H9m[\s\S]{0,600}NOT\s+built/.test(src), /H22[\s\S]{0,700}NOT built/.test(src)], [true, true, true]);
    check("Z1 — recorded: Q1b, the nation card, was already built as H1b (via CB_JURIS)",
      [!!qH("H1b"), (qH("H1b") || {}).ask], [true, "Which part of the UK is the hospital or clinic in?"]);

    /* --- Z2: no figure moves --- */
    const PHS = extra => Object.assign({ sector: "private_hospital", trigger: ["purchase", "refurb"], deal: "property",
      base_amount: 2000000, claimant_type: "company", activity: "trade", dwelling_setting: "mixed", residential_fraction: 0.2,
      facility: "acute", acuity: "high", flags: [], assumptions: [], lrr: true, return_in_time: false,
      still_own_property: "yes", accounting_period_end: "2026-03-31", sufficient_profit: "yes", aia_headroom: "unsure" }, extra || {});
    const figures = r => JSON.stringify([r.QE, r.TS, r.cash, r.cashRoute, r.cashBlocked, r.pool, r.lrr, r.grant]);
    const answered = (st, id, v) => { qH(id).onSet(st, v); return st; };
    const ANSWERS = [
      ["H6a", ["trade_purpose", "let", "both", "unsure"]],
      ["H7b", [["ucv_theatre", "mri_rf", "catering"], ["std_theatre"], ["none"]]],
      ["H7c", [1800, null]], ["H7ct", [3, 0, null]], ["H7ci", [2]], ["H7cu", [8]], ["H7cb", [60]], ["H7cr", [12]],
      ["H9m", [900000, null]], ["H10d", ["yes", "no", "unsure"]],
      ["H21a", [["ucv_theatre", "ips"], ["unsure"]]], ["H22", ["2019-06-01", null]]
    ];
    const bare = safe(() => figures(PH_E.runEngine(PHS())));
    check("Z2 — no figure moves: each answer to each card except H23 leaves the range, tax saving, cash, cash route, pools, land remediation line and grant flag exactly as with no answer",
      safe(() => ANSWERS.reduce((bad, [id, vals]) => bad.concat(vals.filter(v => figures(PH_E.runEngine(answered(PHS(), id, v))) !== bare)
        .map(v => id + "=" + JSON.stringify(v))), [])), []);
    check("Z2 — nor do all of them answered together, on a purchase, a new build and a refurbishment",
      safe(() => [["purchase", "refurb"], ["new_build"], ["refurb", "fitout"]].map(tr => {
        const st = PHS({ trigger: tr });
        ANSWERS.forEach(([id, vals]) => answered(st, id, vals[0]));
        answered(st, "H10a", "mix"); answered(st, "H21", "loose");
        return figures(PH_E.runEngine(st)) === figures(PH_E.runEngine(PHS({ trigger: tr })));
      })), [true, true, true]);
    check("Z2 — H7b records the families and never touches acuity; a judgement family raises H7a's own pool flag, once",
      safe(() => {
        const st = PHS({ acuity: "normal" }); answered(st, "H7b", ["ucv_theatre", "catering"]);
        const a = PHS(); qH("H7a").onSet(a, ["theatres"]); answered(a, "H7b", ["mri_rf"]);
        const plain = PHS(); answered(plain, "H7b", ["catering", "laundry"]);
        return [st.acuity, st.acuity_families, a.flags.length === 1, plain.flags.length];
      }), ["normal", ["ucv_theatre", "catering"], true, 0]);

    /* --- Z3: H6a --- */
    const sepLet = st => st.flags.some(f => /^Separate letting activity/.test(f));
    check("Z3 H6a — let and both raise the separate-letting referral flag; not sure and ABSENT raise none (both asserted)",
      safe(() => [sepLet(answered(PHS(), "H6a", "let")), sepLet(answered(PHS(), "H6a", "both")),
                  sepLet(answered(PHS(), "H6a", "unsure")), sepLet(PHS())]), [true, true, false, false]);
    check("Z3 H6a — shown only for a mixed building; with CB_CTA.trade_not_s35 off, trade-purpose and let give the same figure",
      safe(() => [!!qH("H6a").showIf({ dwelling_setting: "mixed" }), !!qH("H6a").showIf({ dwelling_setting: "institution_commercial" }),
        figures(PH_E.runEngine(answered(PHS(), "H6a", "trade_purpose"))) === figures(PH_E.runEngine(answered(PHS(), "H6a", "let")))]),
      [true, false, true]);
    check("Z3 H6a — with E-5's switch on, the switched residential question is not asked again once H6a is answered; dental still asks it",
      safe(() => {
        const q51 = sec => (liftGated(sec, ["trade_not_s35"]).Q || []).find(q => /51resp$/.test(q.id));
        return [!!q51("private_hospital").showIf({ dwelling_setting: "mixed" }), !!q51("private_hospital").showIf({ dwelling_setting: "mixed", resi_use: "let" }),
                !!q51("dental").showIf({ dwelling_setting: "mixed", resi_use: "let" })];
      }), [true, false, true]);

    /* --- Z4: H23, the one live card --- */
    const lrrRun = v => { const st = PHS({ lrr: false }); answered(st, "H10c", "yes"); if (v !== undefined) answered(st, "H23", v); return { st, r: PH_E.runEngine(st) }; };
    const polluterFlag = r => r.flags.some(f => /^Confirm polluter status/.test(f));
    check("Z4 H23 — a known yes removes the land remediation line and says why; the capital allowances figures do not move",
      safe(() => { const y = lrrRun("yes"), n = lrrRun(undefined);
        return [y.r.lrr, y.r.assumptions.some(a => /only available where the contamination was someone else/.test(a)),
                JSON.stringify([y.r.QE, y.r.TS, y.r.cash, y.r.cashRoute]) === JSON.stringify([n.r.QE, n.r.TS, n.r.cash, n.r.cashRoute])]; }),
      [false, true, true]);
    /* PHASE 132i - the land remediation panel on the RESULT needs a KNOWN "no" (N4): until then "not sure" and
       absent both kept it showing, and absent raised no flag either. The session's lrr still asks H23. */
    check("Z4 H23 N4 — not sure and ABSENT both leave the land remediation panel OFF on the result, while the session still asks H23; only not sure is flagged (both asserted)",
      safe(() => [lrrRun("unsure").r.lrr, lrrRun(undefined).r.lrr, lrrRun("unsure").st.lrr, lrrRun(undefined).st.lrr, polluterFlag(lrrRun("unsure").r), polluterFlag(lrrRun(undefined).r)]),
      [false, false, true, true, true, false]);
    check("Z4 H23 — \"no, we inherited it\" keeps the line and says nothing; a yes changed to no puts the line back and takes the words away",
      safe(() => { const n = lrrRun("no"); const st = PHS({ lrr: false }); answered(st, "H10c", "yes"); answered(st, "H23", "yes"); answered(st, "H23", "no");
        const r = PH_E.runEngine(st);
        return [n.r.lrr, polluterFlag(n.r), r.lrr, r.assumptions.some(a => /someone else/.test(a))]; }),
      [true, false, true, false]);
    check("Z4 H23 — asked only once H10c has said yes",
      safe(() => { const st = PHS({ lrr: false }); const before = !!qH("H23").showIf(st); answered(st, "H10c", "yes"); return [before, !!qH("H23").showIf(st)]; }),
      [false, true]);

    /* --- Z5: the capture cards' gates and flags --- */
    check("Z5 H10d — asked on a refurbishment or fit-out only where H10a said repairs, a mix or not sure; yes and not sure flag, no does not",
      safe(() => {
        const shown = mix => { const st = PHS({ trigger: ["refurb"] }); if (mix) answered(st, "H10a", mix); return !!qH("H10d").showIf(st); };
        const fl = v => answered(PHS(), "H10d", v).flags.length;
        return [shown("repairs"), shown("mix"), shown("unsure"), shown("improve"), shown(null), fl("yes"), fl("unsure"), fl("no")];
      }), [true, true, true, false, false, 1, 1, 0]);
    check("Z5 H21a — asked only after \"only loose equipment\" or \"not sure\"; H21 still gates fixtures already claimed exactly as before",
      safe(() => ["no", "fixtures", "loose", "unsure"].map(v => { const st = PHS(); qH("H21").onSet(st, v); return [!!qH("H21a").showIf(st), !!qH("H21").gate(st)]; })),
      [[false, false], [false, true], [true, false], [true, false]]);
    check("Z5 H22 — a purchase asks for the seller's allowance statement, a let residential part flags E-10, and a blank stores nothing",
      safe(() => {
        const p = answered(PHS({ trigger: ["purchase"] }), "H22", "2020-01-01");
        const l = PHS({ trigger: ["new_build"] }); answered(l, "H6a", "let"); l.flags = []; answered(l, "H22", null);
        return [p.sba_eligible_date, p.flags.some(f => /seller’s allowance statement/.test(f)), "sba_eligible_date" in l, l.flags.some(f => /\(E-10\)/.test(f))];
      }), ["2020-01-01", true, false, true]);
    check("Z5 H7c — counts and area store a known number, a blank stores nothing, and a count of none is kept as 0",
      safe(() => { const st = PHS(); answered(st, "H7c", 1800); answered(st, "H7ct", 0); answered(st, "H7ci", null); answered(st, "H9m", null);
        return [st.gia_m2, st.room_counts, "me_package_amount" in st]; }),
      [1800, { theatres: 0 }, false]);

    /* --- Z6: blank optional answers, through the site's own renderer --- */
    function liftRenderer(sector) {
      const start = engineBody.indexOf("/* ===== " + sector + " ===== */");
      const open = engineBody.indexOf("(function(){", start);
      const reg = engineBody.indexOf('RS["' + sector + '"]=', open);
      const close = engineBody.indexOf("})();", reg);
      const body = engineBody.slice(open + "(function(){".length, close);
      const els = {};
      const mk = id => ({ id, style: {}, dataset: {}, value: "", textContent: "", disabled: false, listeners: {}, onclick: null,
        addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }, setAttribute() {}, getAttribute() { return null; },
        querySelectorAll() { return []; }, querySelector() { return null; }, focus() {}, appendChild() {} });
      const el = id => els[id] || (els[id] = mk(id));
      const stage = el("stage"); let html = "";
      Object.defineProperty(stage, "innerHTML", { get() { return html; }, set(h) { html = h;
        ["inp", "next", "back"].forEach(k => { delete els[k]; });
        if (/id="next"/.test(h)) el("next").disabled = /id="next"[^>]*\sdisabled[\s>]/.test(h); } });
      const doc = { getElementById: el, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return mk("x"); }, addEventListener() {}, body: mk("body") };
      const wrapped = "var document = __doc, window = __win, RS = {}, SECTORS = {};\n" + layerSrc + "\nreturn (function(){\n" + body +
        "\n return { Q: Q, render: render, setIdx: function(i){ idx = i; history = []; }, setS: function(o){ S = o; } };\n})();";
      const api = new Function("__doc", "__win", wrapped)(doc, { addEventListener() {}, location: { href: "" } });
      api.el = el;
      return api;
    }
    const RENDER = {};
    const drive = (sector, id, typed) => safe(() => {
      const R = RENDER[sector] || (RENDER[sector] = liftRenderer(sector));
      const i = R.Q.findIndex(q => q.id === id);
      if (i < 0) return "no question " + id;
      R.setS({ trigger: ["purchase", "refurb"], flags: [], assumptions: [], lrr: false, base_amount: 2000000, facility: "acute", claimant_type: "company" });
      R.setIdx(i); R.render();
      const inp = R.el("inp"), next = R.el("next");
      const atStart = next.disabled;
      inp.value = typed;
      (inp.listeners.input || []).forEach(f => f()); (inp.listeners.change || []).forEach(f => f());
      const afterTyping = next.disabled;
      let passed = "onSet not called";
      const q = R.Q[i], orig = q.onSet;
      q.onSet = (s, v) => { passed = v; };
      try { next.onclick(); } catch (e) { /* the screen after may need more page than this stub has */ }
      q.onSet = orig;
      return [atStart, afterTyping, passed];
    });
    const OPTIONAL = [["care_homes", "Q51profit"], ["dental", "D51s33rc"], ["gp", "G51legal"], ["supported_living", "S51gtr"],
      ["care_homes", "Q51gtr"], ["private_hospital", "H12bv"], ["private_hospital", "H9m"], ["private_hospital", "H7c"],
      ["private_hospital", "H7ct"], ["private_hospital", "H22"], ["care_homes", "Q14pod"]];
    check("Z6 — an optional currency, percent, count or date question may be left blank: Continue is enabled, and the blank is passed as null, never 0",
      OPTIONAL.map(([sec, id]) => [sec + ":" + id].concat(drive(sec, id, ""))).filter(x => JSON.stringify(x.slice(1)) !== JSON.stringify([false, false, null])), []);
    check("Z6 — a figure typed into an optional question is still passed as that figure, and a typed 0 as 0",
      [drive("care_homes", "Q51profit", "250000")[2], drive("private_hospital", "H7ct", "0")[2]], [250000, 0]);
    const REQUIRED = [["private_hospital", "H9"], ["care_homes", "Q9d"], ["dental", "D51s33a1"], ["gp", "G51s33d1"], ["supported_living", "S51slcv"]];
    check("Z6 — a question NOT marked optional still cannot continue blank, in all five renderers",
      REQUIRED.map(([sec, id]) => [sec + ":" + id].concat(drive(sec, id, "").slice(0, 2))).filter(x => !(x[1] === true && x[2] === true)), []);
    check("Z6 — every question marked optional reads a blank as not known: null leaves nothing that a figure could use",
      SECTORS.reduce((bad, sec) => bad.concat((ENGINES[sec].Q || []).filter(q => q.optional === true).filter(q => safe(() => {
        const s = { trigger: ["purchase"], flags: [], assumptions: [] }; q.onSet(s, null);
        return Object.keys(s).filter(k => ["trigger", "flags", "assumptions"].indexOf(k) === -1)
          .some(k => typeof s[k] === "number" && s[k] !== 0);
      }) !== false).map(q => sec + ":" + q.id)), []), []);

    /* --- Z7: the partnership path --- */
    SECTORS.forEach(sec => {
      const E = ENGINES[sec];
      check("Z7 — " + sec + ": the flow's own first question keeps a partnership and an LLP as such, and the company-member question is then asked",
        safe(() => ["partnership", "llp"].map(v => {
          const s = { trigger: [], flags: [], assumptions: [], lrr: false };
          (E.Q || []).find(q => q.id === PREFIX_Z[sec] + "1").onSet(s, v);
          const cm = (E.Q || []).find(q => q.id === PREFIX_Z[sec] + "cmem");
          return [s.claimant_type, !!cm.showIf(s)];
        })), [["partnership", true], ["llp", true]]);
    });
    check("Z7 — recorded: CB_FRONTDOOR's F5, drawn by neither the page nor the back end, still reads every partnership as an individual",
      safe(() => { const s = {}; CB_FRONTDOOR.QUESTIONS.find(q => q.id === "F5").onSet(s, "partnership"); return s.claimant_type; }), "individual");
  }
}


/* =============================================================================
   SUITE AA - PHASE 132c, 15 September 2026.
     AA1-AA3   LINE 5. psc_name and proprietor_name are post-signature only
               (condition CA2, section 15 of the legitimate interests
               assessment). The gate is on the two FIELDS: the free facts on
               the same sources are untouched, each source's own `gate` is
               unchanged, and every engagement that is not KNOWN to be signed
               keeps the two names shut, without a throw.
     AA4-AA7   LINE 6. The buyer's own alteration spend (C-4; FOR THE
               ACCOUNTANT, A3) is asked behind CB_CTA.s185_plus_own_s25 in all
               five flows, and the answer reaches CB_S25.capUplift THROUGH the
               flow - the prior-claim question, then this one, then the engine.
     AA8-AA11  LINE 8. The private residential landlord seller answer, built
               for supported living on 12 September, in care homes, dental, GP
               and private hospitals. Off, the same figure as the tax-paying
               answer; on, the fact reaches the E-8 branch.
   Every one of AA1, AA2, AA4, AA6, AA8, AA9 and AA11 fails against the site as
   it stood before this phase (served through the redirect hook).
   ============================================================================= */
if (startSuite("AA", "Phase 132c — two names after signature, own alteration spend, landlord seller")) {
  const safe = fn => { try { return fn(); } catch (e) { return "threw: " + e.message; } };
  const PFX = { care_homes: "Q", dental: "D", supported_living: "S", gp: "G", private_hospital: "H" };

  /* --- AA1-AA3: line 5, the two names after a signed engagement --- */
  {
    const R = CB_REGISTRY;
    const cf = (src, f, eng) => safe(() => { const c = R.classifyField(src, f, eng); return c.ok ? "ok" : c.code; });
    check("AA1 — the post-signature list is exactly the two permitted names, and each source's own gate is unchanged",
      safe(() => Object.keys(R.SOURCES).map(k => [k, R.SOURCES[k].gate, R.SOURCES[k].postSignature || null])),
      [["homedata", null, []], ["hmlr", null, ["proprietor_name"]], ["epc", null, []], ["cqc", null, []],
       ["companies_house", null, ["psc_name"]], ["voa", "licence", []]]);
    check("AA1 — every post-signature field is one of the two permitted names, so the gate cannot open a name N2 refuses",
      safe(() => Object.keys(R.SOURCES).reduce((bad, k) => bad.concat((R.SOURCES[k].postSignature || [])
        .filter(f => R.SOURCES[k].permitted.indexOf(f) === -1).map(f => k + "." + f)), [])), []);

    /* N4: an ABSENT record and "unsure" are each asserted, never one for both */
    check("AA2 — with no engagement handed in at all, both names are NOT_PERMITTED_YET",
      [cf("hmlr", "proprietor_name"), cf("companies_house", "psc_name")], ["NOT_PERMITTED_YET", "NOT_PERMITTED_YET"]);
    const NOT_KNOWN_SIGNED = [undefined, null, "unsure", "yes", true, {}, { signed: false }, { signed: "unsure" },
                              { signed: "yes" }, { signed: 1 }, { letter_state: "SIGNED" }];
    check("AA2 — ABSENT, \"unsure\", a bare \"yes\" and a record not saying signed === true all keep both names shut, and none throws",
      NOT_KNOWN_SIGNED.map(e => [cf("hmlr", "proprietor_name", e), cf("companies_house", "psc_name", e)]),
      NOT_KNOWN_SIGNED.map(() => ["NOT_PERMITTED_YET", "NOT_PERMITTED_YET"]));
    check("AA2 — it is a state and not an error: postSignature is marked and the reason names the signed engagement",
      safe(() => { const c = R.classifyField("hmlr", "proprietor_name"); return [c.ok, c.postSignature, /signed engagement/.test(c.why)]; }),
      [false, true, true]);

    check("AA3 — with the server's signed record, both names are permitted",
      [cf("hmlr", "proprietor_name", { signed: true, letter_state: "SIGNED" }), cf("companies_house", "psc_name", { signed: true })],
      ["ok", "ok"]);
    check("AA3 — the free facts on the same two sources need no engagement: tenure, price paid, completion date, entity type, year end",
      [cf("hmlr", "tenure"), cf("hmlr", "price_paid"), cf("hmlr", "completion_date"),
       cf("companies_house", "entity_type"), cf("companies_house", "year_end")],
      ["ok", "ok", "ok", "ok", "ok"]);
    check("AA3 — a signed engagement opens no other name: a director, a secretary, a registered manager, an EPC assessor",
      [cf("companies_house", "director_name", { signed: true }), cf("companies_house", "secretary_name", { signed: true }),
       cf("cqc", "registered_manager_name", { signed: true }), cf("epc", "assessor_name", { signed: true })],
      ["E_PERSONAL_FIELD_NOT_PERMITTED", "E_PERSONAL_FIELD_NOT_PERMITTED", "E_PERSONAL_FIELD_NOT_PERMITTED", "E_PERSONAL_FIELD_NOT_PERMITTED"]);
    check("AA3 — with the free layer forced on, names in the bundle never reach the values, the free price still derives, and nothing throws",
      safe(() => {
        R.precondition.enabled = true;
        try {
          const d = R.derive({ hmlr: { proprietor_name: "A Person", price_paid: 450000 }, companies_house: { psc_name: "A Person" } },
                             { nation: "england", sector: "supported_living" });
          return ["proprietor_name" in d.values, "psc_name" in d.values, d.values.price_paid];
        } finally { R.precondition.enabled = false; }
      }), [false, false, 450000]);
  }

  /* --- AA4-AA7: line 6, the buyer's own alteration spend --- */
  {
    const C4 = ["s185_plus_own_s25"];
    const ELECTION = {
      prior_owner_entitled: "yes", election_document: "held",
      election_content: ["amount", "plant", "land", "interest", "utrs", "both"], election_value: 300000,
      acquisition_date: "2026-01-01", election_notified_date: "2026-02-01",
      transaction_type: "sale", election_multi_property: "no", election_scope: "all_fixtures"
    };
    const baseState = (sector, extra) => Object.assign({
      sector: sector, trigger: ["purchase"], deal: "property",
      base_amount: 2000000, claimant_type: "company", activity: "trade",
      dwelling_setting: "institution_commercial", acuity: "normal",
      flags: [], assumptions: [], lrr: false, return_in_time: false
    }, ELECTION, extra || {});
    /* THROUGH THE FLOW: walk the sector's own question list in order, answer
       only the questions named (by the id after the sector letter), and only
       where the flow would show them. Then run that same engine. */
    const through = (sector, gates, answers, extra) => safe(() => {
      const M = liftGated(sector, gates), s = baseState(sector, extra), asked = [];
      (M.Q || []).forEach(q => {
        const key = q.id.replace(/^[A-Z]/, "");
        if (!Object.prototype.hasOwnProperty.call(answers, key)) return;
        if (q.showIf && !q.showIf(s)) return;
        asked.push(key); q.onSet(s, answers[key]);
      });
      const r = M.runEngine(s);
      return { QE: r.QE, s25: s.s25_alterations_expenditure, asked: asked,
               plusI: s.flags.some(f => /“\+ I” APPLIED/.test(f)) };
    });
    const q25 = (sector, gates) => (liftGated(sector, gates).Q || []).find(q => q.id === PFX[sector] + "51s25");
    const PRIOR_KNOWN = baseState("care_homes", { prior_owner_claimed: "yes" });

    check("AA4 — off: the question is built in all five flows and never shown, even on a purchase with a past owner's claim known",
      SECTORS.map(sec => safe(() => { const q = q25(sec, []); return [!!q, q ? !!q.showIf(Object.assign({}, PRIOR_KNOWN, { sector: sec })) : null]; })),
      SECTORS.map(() => [true, false]));
    check("AA4 — off, end to end: an answer offered for it is never taken, and no figure moves, in all five sectors",
      SECTORS.map(sec => safe(() => {
        const withA = through(sec, [], { "11": "yes", "51s25": 40000 }), without = through(sec, [], { "11": "yes" });
        return [withA.asked, withA.s25, JSON.stringify(withA.QE) === JSON.stringify(without.QE), withA.plusI];
      })),
      SECTORS.map(() => [["11"], null, true, false]));

    check("AA5 — on: shown for a purchase with a past owner's claim KNOWN; not for a claim \"no\", \"unsure\" or ABSENT, nor for a project that is not a purchase",
      SECTORS.map(sec => safe(() => {
        const q = q25(sec, C4), st = extra => Object.assign(baseState(sec), extra);
        const noClaim = st({}); delete noClaim.prior_owner_claimed;
        return [!!q.showIf(st({ prior_owner_claimed: "yes" })), !!q.showIf(st({ prior_owner_claimed: "no" })),
                !!q.showIf(st({ prior_owner_claimed: "unsure" })), !!q.showIf(noClaim),
                !!q.showIf(st({ prior_owner_claimed: "yes", trigger: ["refurb_fitout"] }))];
      })),
      SECTORS.map(() => [true, false, false, false, false]));

    check("AA6 — on, end to end in care homes: the election caps at 300k, and the buyer's own 40k answered in the flow lifts the ceiling to 340k",
      safe(() => { const a = through("care_homes", C4, { "11": "yes", "51s25": 40000 }), b = through("care_homes", C4, { "11": "yes" });
                   return [b.QE, a.asked, a.s25, a.QE, a.plusI]; }),
      [[300000, 300000], ["11", "51s25"], 40000, [340000, 340000], true]);
    check("AA6 — on, end to end in all five sectors: the answer is taken and adds exactly 40k to both ends, through capUplift",
      SECTORS.map(sec => safe(() => {
        const a = through(sec, C4, { "11": "yes", "51s25": 40000 }), b = through(sec, C4, { "11": "yes" });
        return [a.asked.indexOf("51s25") !== -1, a.QE[0] - b.QE[0], a.QE[1] - b.QE[1], a.plusI];
      })),
      SECTORS.map(() => [true, 40000, 40000, true]));

    check("AA7 — on, N4: a blank (null), \"unsure\", a typed 0 and NEVER ANSWERED each leave the fact unset and no uplift, in all five (all four asserted)",
      SECTORS.map(sec => safe(() => {
        const none = through(sec, C4, { "11": "yes" });
        return [null, "unsure", 0].map(v => { const x = through(sec, C4, { "11": "yes", "51s25": v });
                                             return [x.s25 === undefined, JSON.stringify(x.QE) === JSON.stringify(none.QE), x.plusI]; })
          .concat([[none.s25 === undefined, true, none.plusI]]);
      })),
      SECTORS.map(() => [[true, true, false], [true, true, false], [true, true, false], [true, true, false]]));
    check("AA7 — on, N4: a past owner's claim \"not sure\" in the flow does not ask it, so an offered figure adds nothing",
      SECTORS.map(sec => safe(() => {
        const a = through(sec, C4, { "11": "unsure", "51s25": 40000 }), b = through(sec, C4, { "11": "unsure" });
        return [a.asked, JSON.stringify(a.QE) === JSON.stringify(b.QE), a.s25 === undefined];
      })),
      SECTORS.map(() => [["11"], true, true]));
    check("AA7 — a figure withdrawn by answering blank afterwards is removed, not left standing",
      SECTORS.map(sec => safe(() => { const s = {}; const q = q25(sec, C4); q.onSet(s, 40000); const had = s.s25_alterations_expenditure;
                                      q.onSet(s, null); return [had, "s25_alterations_expenditure" in s]; })),
      SECTORS.map(() => [40000, false]));
  }

  /* --- AA8-AA11: line 8, the landlord seller in the other four flows --- */
  {
    const E8 = ["s187a_needs_entitled_owner"];
    const FOUR = ["care_homes", "dental", "gp", "private_hospital"];
    const x12 = (sec, gates) => (liftGated(sec, gates || []).Q || []).find(q => q.id === PFX[sec] + "12");
    const answered = (sec, v, gates) => { const s = { trigger: ["purchase"], deal: "property", flags: [], assumptions: [] }; x12(sec, gates).onSet(s, v); return s; };
    const S12_LINE = safe(() => answered("supported_living", "residential_landlord").assumptions[0]);
    const H5ISH = { prior_owner_claimed: "yes", election_document: "exists_not_held", election_value: 50000, earlier_entitled_owner: "no" };
    const runAnswered = (sec, gates, v) => safe(() => {
      const M = liftGated(sec, gates);
      const s = Object.assign({ sector: sec, trigger: ["purchase"], deal: "property", base_amount: 2000000, claimant_type: "company",
        activity: "trade", dwelling_setting: "institution_commercial", acuity: "normal", flags: [], assumptions: [], lrr: false,
        return_in_time: false }, H5ISH);
      M.Q.find(q => q.id === PFX[sec] + "12").onSet(s, v);
      const r = M.runEngine(s);
      return { QE: r.QE, el: typeof s.election_outcome, e8: s.flags.some(f => /s\.187A NOT ENGAGED/.test(f)),
               flags: s.flags.filter(f => !/^seller was a private landlord/.test(f)) };
    });

    check("AA8 — with E-8 off, the landlord answer renders in care homes, dental, GP and private hospitals, worded as in supported living",
      FOUR.concat(["supported_living"]).map(sec => safe(() => (x12(sec).opts.find(o => o[0] === "residential_landlord") || [null, null])[1])),
      ["A private landlord who let it out as homes", "A private landlord who let it out as homes", "A private landlord who let it out as homes",
       "A private landlord who let it out as homes", "A private landlord who let it out as homes"]);
    check("AA8 — GP keeps \"A private individual / other\", and it still records the seller as not known and sets no bar",
      safe(() => { const s = answered("gp", "other"); return [x12("gp").opts.some(o => o[0] === "other"), s.prior_owner_entitled, s.prior_owner_s35_barred === undefined]; }),
      [true, "unsure", true]);

    check("AA9 — the landlord answer sets what the tax-paying answer sets, plus the s.35 bar, plus S12's own assumption line word for word",
      FOUR.map(sec => safe(() => { const a = answered(sec, "residential_landlord"), b = answered(sec, "taxpaying");
        return [a.prior_owner_entitled, b.prior_owner_entitled, a.prior_owner_s35_barred, "prior_owner_s35_barred" in b,
                a.assumptions.length === 1 && a.assumptions[0] === S12_LINE, b.assumptions.length]; })),
      FOUR.map(() => ["yes", "yes", true, false, true, 0]));
    check("AA9 — N4: \"Not sure\" records the seller as not known and sets no bar, in all five flows",
      SECTORS.map(sec => safe(() => { const s = answered(sec, "unsure"); return [s.prior_owner_entitled, "prior_owner_s35_barred" in s]; })),
      SECTORS.map(() => ["unsure", false]));

    check("AA10 branch B — with E-8 off, the landlord answer gives the same range, the same triage and the same flags as the tax-paying answer",
      FOUR.map(sec => safe(() => { const a = runAnswered(sec, [], "residential_landlord"), b = runAnswered(sec, [], "taxpaying");
        return [JSON.stringify(a.QE) === JSON.stringify(b.QE), a.el, b.el, a.e8, JSON.stringify(a.flags) === JSON.stringify(b.flags)]; })),
      FOUR.map(() => [true, "object", "object", false, true]));

    check("AA11 branch A — with E-8 on, the landlord answer reaches the E-8 branch (s.187A not engaged, flagged); the tax-paying answer does not",
      FOUR.map(sec => safe(() => { const a = runAnswered(sec, E8, "residential_landlord"), b = runAnswered(sec, E8, "taxpaying");
        return [a.el, a.e8, b.el, b.e8]; })),
      FOUR.map(() => ["undefined", true, "object", false]));
    check("AA11 flow — the landlord answer leads straight to the chain question with E-8 on, and not with it off, in all four",
      FOUR.map(sec => safe(() => { const st = answered(sec, "residential_landlord", E8);
        const on = (liftGated(sec, E8).Q || []).find(q => q.id === PFX[sec] + "12b"), off = (liftGated(sec, []).Q || []).find(q => q.id === PFX[sec] + "12b");
        return [!!on.showIf(st), !!off.showIf(st)]; })),
      FOUR.map(() => [true, false]));
  }
}


/* =============================================================================
   SUITE AB — PHASE 132e. The no-claim threshold: "below the recommendation
   threshold".

   DECIDED by Lakhbir Dhillon (answer read 15 September 2026, built 16 September
   2026): the threshold is about the client's benefit only; £1,000 of tax relief
   to the client after our fee; the client still chooses. The relief read is the
   engine's five-year cumulative relief (CB_BENEFIT cumulative_benefit), a
   reading marked for the tax adviser.

   WHAT THIS SUITE PROVES, AND IT IS FOUR THINGS. It FIRES below the line and
   prints the figures. It does NOT fire at or above the line. It refuses no
   work, withholds no quote and moves no figure. And an UNKNOWN relief - a tax
   rate answered "not sure" and a tax rate never given, a pool split answered
   "not sure" and one never given - never fires it and is never read as nil,
   and the two forms of each give identical answers (N4).
   ============================================================================= */
if (startSuite("AB", "Phase 132e — the no-claim threshold")) {
  /* Written so that against a site with no threshold every check FAILS rather
     than the harness dying: a missing report reads as an empty one. */
  const safe = fn => { try { return fn(); } catch (e) { return "threw: " + e.message; } };
  const NC = r => (r && r.recommendation_threshold) || {};
  const gbp = n => (n < 0 ? "-" : "") + "\u00a3" + Math.round(Math.abs(n)).toLocaleString("en-GB");
  const SPECIAL = { main: 0, special: 20000, period_start: "2026-04-01", is_company: true };
  const EU = { main: 34075, special: 39665, period_start: "2022-04-06", is_company: false };

  /* --- NCT1: it fires below the line, and prints the figures ------------ */
  const low = CB_FEE.display(20000, 0.25, SPECIAL);
  const t = NC(low);
  check("NCT1 — £20,000 of special-rate allowances for a company at 25%: relief after our fee is below £1,000, so it fires",
    [t.outcome, t.fires, t.determined, t.threshold, Math.round(t.relief), t.fee, Math.round(t.relief_after_fee)],
    ["BELOW_THRESHOLD", true, true, 1000, 1330, 600, 730]);
  check("NCT1 — the relief after our fee is the five-year cumulative relief minus the fee, and it says which relief it used",
    [t.relief === low.comparison.cumulative_benefit, t.relief_after_fee === t.relief - t.fee, t.relief_basis, t.horizon_years],
    [true, true, "cumulative_benefit", 5]);
  check("NCT1 — the message prints all three figures, says we would not normally recommend claiming, and leaves the choice to the client",
    [typeof t.message, (t.message || "").indexOf(gbp(t.relief)) >= 0, (t.message || "").indexOf(gbp(t.fee)) >= 0,
     (t.message || "").indexOf(gbp(t.relief_after_fee)) >= 0,
     /would not normally recommend/.test(t.message || ""), /The choice is yours/.test(t.message || "")],
    ["string", true, true, true, true, true]);

  /* --- NCT2: it refuses no work, withholds no quote, moves no figure ----- */
  check("NCT2 — firing refuses no work and withholds no quote: the fee still renders, with no reason given",
    [low.render, low.amount, low.reason, t.refuses_work, t.withholds_quote, t.moves_figure, t.client_chooses],
    [true, 600, null, false, false, false, true]);
  check("NCT2 — and the fee, its readings, the disclosure and the benefit comparison are exactly what the plain fee call gives",
    (function(){
      const plain = CB_FEE.display(20000, 0.25, SPECIAL);
      const strip = o => { const c = Object.assign({}, o); delete c.recommendation_threshold; return JSON.stringify(c); };
      return [strip(low) === strip(plain), low.amount === 20000 * CB_FEE.RATE,
              low.readings.of_allowances === 20000 * CB_FEE.RATE];
    })(),
    [true, true, true]);
  check("NCT2 — the report adds exactly one key to the fee result, on every path",
    [Object.keys(low).filter(k => k === "recommendation_threshold").length,
     "recommendation_threshold" in CB_FEE.display(null, 0.25)],
    [1, true]);

  /* --- NCT3: it does not fire at or above the line ----------------------- */
  const eu = NC(CB_FEE.display(73740, 0.40, EU));
  check("NCT3 — the Eureka case: relief after our fee is well above £1,000, so it does not fire and prints nothing",
    [eu.outcome, eu.fires, eu.message, Math.round(eu.relief_after_fee)],
    ["AT_OR_ABOVE_THRESHOLD", false, null, 10340]);
  check("NCT3 — exactly £1,000 after our fee is not below the line; a penny less is",
    [safe(() => CB_FEE.recommendationThreshold(600, { computed: true, determined: true, cumulative_benefit: 1600, horizon_years: 5 }).fires),
     safe(() => CB_FEE.recommendationThreshold(600, { computed: true, determined: true, cumulative_benefit: 1599.99, horizon_years: 5 }).fires)],
    [false, true]);

  /* --- NCT4: N4. Unknown relief never fires it and is never nil ---------- */
  const unsureRate = CB_FEE.display(20000, "not sure", SPECIAL);
  const absentRate = CB_FEE.display(20000, undefined, SPECIAL);
  check("NCT4 — a tax rate answered \"not sure\" and a tax rate never given both leave it UNDETERMINED, not fired",
    [NC(unsureRate).outcome, NC(absentRate).outcome, NC(unsureRate).fires, NC(absentRate).fires],
    ["UNDETERMINED", "UNDETERMINED", false, false]);
  check("NCT4 — and the two give IDENTICAL reports, field by field",
    [typeof unsureRate.recommendation_threshold, JSON.stringify(NC(unsureRate)) === JSON.stringify(NC(absentRate))], ["object", true]);
  check("NCT4 — an unknown relief is not read as nil: relief and relief after fee are null, and no message is printed",
    [NC(unsureRate).relief, NC(unsureRate).relief_after_fee, NC(unsureRate).message, unsureRate.render, unsureRate.amount],
    [null, null, null, true, 600]);

  const unsureSplit = CB_FEE.display(20000, 0.25, { main: "not sure", special: "not sure", period_start: "2026-04-01", is_company: true });
  const absentSplit = CB_FEE.display(20000, 0.25, { period_start: "2026-04-01", is_company: true });
  check("NCT4 — a pool split answered \"not sure\" and one never given both leave a range, and a range never fires it",
    [unsureSplit.comparison.determined, absentSplit.comparison.determined,
     NC(unsureSplit).outcome, NC(absentSplit).outcome],
    [false, false, "UNDETERMINED", "UNDETERMINED"]);
  check("NCT4 — and those two are identical too",
    [typeof unsureSplit.recommendation_threshold, JSON.stringify(NC(unsureSplit)) === JSON.stringify(NC(absentSplit))], ["object", true]);
  check("NCT4 — with no allowances there is no fee, and it is UNDETERMINED for that reason",
    (function(){ const r = NC(CB_FEE.display(null, 0.25, SPECIAL));
                 return [r.outcome, r.fee, /no fee for this case yet/.test(r.why || "")]; })(),
    ["UNDETERMINED", null, true]);

  /* --- NCT5: marked for the tax adviser, in the metadata and in the code - */
  check("NCT5 — the output and the settings say the wording awaits the tax adviser's review",
    [t.awaiting_tax_adviser_review, (CB_FEE.NO_CLAIM_THRESHOLD || {}).awaiting_tax_adviser_review,
     (CB_FEE.NO_CLAIM_THRESHOLD || {}).relief_after_fee_below, (CB_FEE.NO_CLAIM_THRESHOLD || {}).decided_by],
    [true, true, 1000, "Lakhbir Dhillon"]);
  check("NCT5 — and the code comment says so in terms",
    /THE WORDING IS AWAITING THE TAX ADVISER'S REVIEW/.test(src.slice(src.indexOf("var CB_FEE"), src.indexOf("var CB_FEEGUARD"))),
    true);

  /* --- NCT6: where the engagement gate withholds the quote, no fee is printed here either */
  (function(){
    let JE = null; try { JE = require(P9 + "/caprebate-job-economics.cjs"); } catch (e) { JE = null; }
    if (!JE) { check("NCT6 — the phase9 job-economics module loads", "missing", "loaded"); return; }
    const keep = { enabled: CB_GATE_CONFIG.enabled, jobs_per_year: CB_GATE_CONFIG.jobs_per_year, costing: CB_GATE_CONFIG.costing };
    try {
      CB_GATE_CONFIG.enabled = true; CB_GATE_CONFIG.jobs_per_year = 25; CB_GATE_CONFIG.costing = JE.costingForGate;
      const w = CB_FEE.display(20000, 0.25, Object.assign({ sector: "dental" }, SPECIAL));
      check("NCT6 — gate on and firing: the quote is withheld by the GATE, the threshold still fires, and its message prints no fee",
        [w.render, w.gate.withholds_quote, NC(w).fires, NC(w).message, NC(w).withholds_quote],
        [false, true, true, null, false]);
    } finally {
      CB_GATE_CONFIG.enabled = keep.enabled; CB_GATE_CONFIG.jobs_per_year = keep.jobs_per_year; CB_GATE_CONFIG.costing = keep.costing;
    }
  })();
}

/* =============================================================================
   SUITE AC - PHASE 132f, 16 September 2026. The landlord seller answer, taken
   back.

   Phase 132c's landlord answer (suite AA, AA8-AA11) set prior_owner_s35_barred
   and pushed its assumption line, and nothing ever took them off. A client who
   picked "A private landlord who let it out as homes", went back and chose any
   other seller kept the bar and the line, in all five flows; picking the
   landlord twice stacked the line. The fix takes both off on every call and
   puts them back only for the landlord answer.

     AC1  set, then changed to ANY other answer - every other option, "Not
          sure", and the answer cleared (undefined and null) - leaves neither
          the fact nor the line, and the session is exactly what that answer
          alone would have produced. All five flows.
     AC2  the unchanged landlord answer still sets both, exactly once, however
          many times it is given and whatever came before it.
     AC3  N4: "Not sure" and ABSENT (undefined) give identical sessions, fresh
          and after the landlord answer.
     AC4  with CB_CTA.s187a_needs_entitled_owner OFF (asserted, not assumed) no
          figure moves either way: landlord against the tax-paying answer, and
          landlord-then-changed against the changed answer given alone.
   Seven of the eleven checks - all three AC1, the AC2 repeat, both AC3 and the
   whole-result AC4 - fail against the site as it stood before this phase
   (redirect hook, served "Caprebate site.html.bak-phase132f", 3 reads). The
   other four are guards that held before and must keep holding: the switch
   is off, the landlord answer alone sets both, and no figure moves.
   ============================================================================= */
if (startSuite("AC", "Phase 132f — the landlord seller answer, taken back")) {
  const safe = fn => { try { return fn(); } catch (e) { return "threw: " + e.message; } };
  const PFX = { care_homes: "Q", dental: "D", supported_living: "S", gp: "G", private_hospital: "H" };
  const LL = "residential_landlord";
  const isLine = x => /^seller was a private landlord letting the building as homes/.test(String(x));
  const q12 = sec => (liftGated(sec, []).Q || []).find(q => q.id === PFX[sec] + "12");
  const fresh = () => ({ trigger: ["purchase"], deal: "property", flags: [], assumptions: [] });
  const answer = (sec, seq) => { const q = q12(sec); const s = fresh(); seq.forEach(v => q.onSet(s, v)); return s; };
  const bare = s => ["prior_owner_s35_barred" in s, s.assumptions.filter(isLine).length];
  const others = sec => safe(() => q12(sec).opts.map(o => o[0]).filter(v => v !== LL).concat([undefined, null]));

  check("AC0 — the never-entitled seller switch is OFF in the layer under test",
    [/s187a_needs_entitled_owner\s*:\s*false/.test(layerSrc), /s187a_needs_entitled_owner\s*:\s*true/.test(layerSrc)], [true, false]);

  check("AC1 — landlord, then any other answer (every option, \"Not sure\", undefined, null): neither the bar nor the line survives, in all five flows",
    SECTORS.map(sec => safe(() => others(sec).map(v => bare(answer(sec, [LL, v]))))),
    SECTORS.map(sec => safe(() => others(sec).map(() => [false, 0]))));
  check("AC1 — and the session is exactly the one that answer alone produces, field by field, in all five",
    SECTORS.map(sec => safe(() => others(sec).every(v => JSON.stringify(answer(sec, [LL, v])) === JSON.stringify(answer(sec, [v]))))),
    SECTORS.map(() => true));
  check("AC1 — an unrelated assumption already on the session is left where it was",
    SECTORS.map(sec => safe(() => { const q = q12(sec); const s = fresh(); s.assumptions.push("an earlier line");
      q.onSet(s, LL); q.onSet(s, "taxpaying"); return s.assumptions; })),
    SECTORS.map(() => ["an earlier line"]));

  check("AC2 — the landlord answer alone still sets the bar and the line, once, and records the seller as entitled, in all five",
    SECTORS.map(sec => safe(() => { const s = answer(sec, [LL]); return [s.prior_owner_s35_barred, s.assumptions.filter(isLine).length, s.prior_owner_entitled]; })),
    SECTORS.map(() => [true, 1, "yes"]));
  check("AC2 — given twice, or after another answer, or after being cleared, it is still set exactly once",
    SECTORS.map(sec => safe(() => [[LL, LL], ["taxpaying", LL], [LL, "unsure", LL], [LL, undefined, LL]]
      .map(seq => { const s = answer(sec, seq); return [s.prior_owner_s35_barred, s.assumptions.filter(isLine).length]; }))),
    SECTORS.map(() => [[true, 1], [true, 1], [true, 1], [true, 1]]));

  check("AC3 — N4: \"Not sure\" and ABSENT give identical sessions, fresh and after the landlord answer, in all five",
    SECTORS.map(sec => safe(() => [
      JSON.stringify(answer(sec, ["unsure"])) === JSON.stringify(answer(sec, [undefined])),
      JSON.stringify(answer(sec, [LL, "unsure"])) === JSON.stringify(answer(sec, [LL, undefined])),
      JSON.stringify(answer(sec, [LL, "unsure"])) === JSON.stringify(answer(sec, ["unsure"])),
      answer(sec, [LL, undefined]).prior_owner_entitled])),
    SECTORS.map(() => [true, true, true, "unsure"]));
  check("AC3 — nothing throws on a session with no assumptions list, set or cleared",
    SECTORS.map(sec => safe(() => { const q = q12(sec); const s = {}; q.onSet(s, LL); const a = s.prior_owner_s35_barred; q.onSet(s, undefined);
      return [a, "prior_owner_s35_barred" in s, (s.assumptions || []).filter(isLine).length]; })),
    SECTORS.map(() => [true, false, 0]));

  const FIG = ["outcome", "QE", "TS", "cash", "cashRoute", "cashBlocked", "cashGates", "pool", "speed", "lrr", "grant", "sipp"];
  const runSeq = (sec, seq, extra) => safe(() => {
    const M = liftGated(sec, []), q = M.Q.find(x => x.id === PFX[sec] + "12");
    const s = Object.assign({ sector: sec, trigger: ["purchase"], deal: "property", base_amount: 2000000, claimant_type: "company",
      activity: "trade", dwelling_setting: "institution_commercial", acuity: "normal", flags: [], assumptions: [], lrr: false,
      return_in_time: false }, extra);
    seq.forEach(v => q.onSet(s, v));
    const r = M.runEngine(s);
    return { fig: JSON.stringify(FIG.map(k => r[k])), flags: JSON.stringify(r.flags),
             rest: JSON.stringify((r.assumptions || []).filter(x => !isLine(x))), all: JSON.stringify(r) };
  });
  const FACTS = [
    { prior_owner_claimed: "yes", election_document: "exists_not_held", election_value: 50000, earlier_entitled_owner: "no" },
    { prior_owner_claimed: "unsure" },
  ];

  check("AC4 — switch off: the landlord answer and the tax-paying answer give the same figures, flags and other assumptions, in all five, two fact sets",
    SECTORS.map(sec => FACTS.map(f => safe(() => { const a = runSeq(sec, [LL], f), b = runSeq(sec, ["taxpaying"], f);
      return [a.fig === b.fig, a.flags === b.flags, a.rest === b.rest]; }))),
    SECTORS.map(() => FACTS.map(() => [true, true, true])));
  check("AC4 — switch off: landlord then changed gives the SAME result, whole, as the changed answer alone (tax-paying, \"Not sure\", absent), in all five",
    SECTORS.map(sec => FACTS.map(f => safe(() => ["taxpaying", "unsure", undefined].map(v => runSeq(sec, [LL, v], f).all === runSeq(sec, [v], f).all)))),
    SECTORS.map(() => FACTS.map(() => [true, true, true])));
  check("AC4 — and no figure moves on the change itself: landlord, then tax-paying, against landlord alone",
    SECTORS.map(sec => FACTS.map(f => safe(() => runSeq(sec, [LL, "taxpaying"], f).fig === runSeq(sec, [LL], f).fig))),
    SECTORS.map(() => FACTS.map(() => true)));
}


/* =============================================================================
   SUITE AD - PHASE 132g, 16 September 2026. A changed answer takes back what
   its old answer set - every question, all five flows.

   The flow's Back button re-asks a question on the SAME session. Suite AC
   proved one answer (the landlord seller) left its fact and line behind; the
   Phase 132g audit ran every question in all five flows through A then B, A
   then "Not sure", A then cleared (undefined and null) and A twice, and found
   36 more whose old fact or assumption line survived a change, or whose line
   stacked, and two multi-choice questions (S6b, H7a) that THREW on a cleared
   answer. Each is wrapped once by answerTakesBack in its flow; S6b and H7a
   read a cleared answer as an empty list, as H7b already did.

     AD0  the switches are off in the layer under test (asserted, not assumed).
     AD1  for every fixed question: answer A, then change to ANY other answer -
          every option, "Not sure", undefined, null - gives the facts and
          assumption lines that answer alone gives. Two starting sessions.
     AD2  N4, asserted both ways: A then "Not sure" equals "Not sure" alone;
          A then ABSENT (undefined, and null) equals absent alone; and nothing
          throws on a cleared answer.
     AD3  a repeated answer does not stack: A twice is A once, whole session.
     AD4  the single answer is unchanged: a fingerprint of every fixed
          question's single-answer session, over every option and three
          starting sessions, pinned from the site before this phase; and
          each line an answer gives appears exactly once.
     AD5  generic, every question in every flow (not only the fixed ones),
          switches off and all on: "A then B" deep-equals "B alone" on facts
          and assumption lines.
     AD6  nothing another question owns is taken: an unrelated line stays, a
          date another question set is not cleared, the flow's lrr:false
          starting value comes back, S6bl (the shared lounge) by name.
     AD7  no figure moves: a changed answer gives the same figures and
          assumptions from runEngine as that answer alone, and a single
          answer's figures are the same as before (the fingerprint, AD4).
   FLAGS ARE OUT OF SCOPE and are NOT asserted: pushFlag de-duplicates but
   nothing takes a flag back on a change (173 flag-only questions, and the
   fixed ones' flags), and H7a/H7b raise the same flag text, so a take-back
   needs a design decision first. Recorded in README-file-index.md, Phase 132g.
   PHASE 132h, 16 September 2026: flags are now taken back, every question is
   wrapped, and outcome follows - suite AE asserts it. The checks below are
   unchanged and still hold; AD5 and AD7 still leave flags and outcome out.
   Eight of the thirteen checks - AD1, both AD2, AD3, AD5, the lrr and S6bl
   AD6 and AD7 - fail against the site as it stood before this phase (redirect
   hook, served "Caprebate site.html.bak-phase132g", 3 reads; every other
   suite stayed green). The other five are guards that held before and must
   keep holding: the switches are off, the fingerprint and the once-only
   lines of a single answer, an unrelated line and another question's date.
   ============================================================================= */
if (startSuite("AD", "Phase 132g — a changed answer takes back what it set, all five flows")) {
  const safe = fn => { try { return fn(); } catch (e) { return "threw: " + e.message; } };
  const FIXED = {
    care_homes: ["Q0a", "Q1", "Q1a", "Q9d", "Q10c", "Q17"],
    dental: ["D1n", "D1a", "D9d", "D10c", "D17"],
    supported_living: ["S1", "S1n", "S4", "S5v", "S6a", "S6bl", "S6b", "S6c", "S9d", "S10c", "S17"],
    gp: ["G1", "G1b", "G9d", "G10c", "G17", "G18"],
    private_hospital: ["H1", "H1a", "H1b", "H7a", "H9d", "H10c", "H23", "H17"] };
  const ALL_GATES = (layerSrc.slice(layerSrc.indexOf("var CB_CTA"), layerSrc.indexOf("};", layerSrc.indexOf("var CB_CTA")))
    .match(/^\s*([a-z0-9_]+)\s*:\s*false/gm) || []).map(x => x.replace(/:.*$/, "").trim());
  const MODS = {}; const mod = (sec, on) => (MODS[sec + on] = MODS[sec + on] || liftGated(sec, on ? ALL_GATES : []));
  const qOf = (sec, id, on) => (mod(sec, on).Q || []).find(q => q.id === id);
  const BASES = [
    () => ({ trigger: ["purchase"], deal: "property", flags: [], assumptions: [] }),
    () => ({ trigger: [], flags: [], assumptions: [], lrr: false }) ];
  const J = x => JSON.stringify(x, (k, v) => v === undefined ? "__undefined__" : v);
  const noFlags = s => { if (typeof s === "string") return s; const o = Object.assign({}, s); delete o.flags; return J(o); };
  const valsOf = q => q.type === "single" ? q.opts.map(o => o[0])
    : q.type === "multi" ? [[q.opts[0][0]], q.opts.map(o => o[0]), [], [q.opts[q.opts.length - 1][0]]]
    : q.type === "date" ? ["2020-01-01", "2025-06-01"]
    : (q.type === "currency" || q.type === "percent" || q.type === "number") ? [0, 50000, 400000] : ["x"];
  const run = (q, base, seq) => safe(() => { const s = base(); seq.forEach(v => q.onSet(s, v)); return s; });
  const mismatches = (sec, ids, on, cmp) => ids.map(id => {
    const q = qOf(sec, id, on); if (!q || !q.onSet) return id + " missing";
    const bad = [];
    BASES.forEach((base, bi) => valsOf(q).forEach(a => cmp(q, base, a).forEach(x => { if (x) bad.push(id + " base" + bi + " " + J(a) + " " + x); })));
    return bad.slice(0, 3);
  }).filter(x => typeof x === "string" || x.length);

  check("AD0 — every CB_CTA switch is OFF in the layer under test",
    [ALL_GATES.length >= 20, /shared_lounge_claimable\s*:\s*true/.test(layerSrc)], [true, false]);

  check("AD1 — every fixed question, every flow: A then any other answer (every option, \"Not sure\", undefined, null) leaves the facts and lines that answer alone leaves",
    SECTORS.map(sec => mismatches(sec, FIXED[sec], false, (q, base, a) => valsOf(q).concat([undefined, null])
      .map(b => noFlags(run(q, base, [a, b])) === noFlags(run(q, base, [b])) ? null : "then " + J(b)))),
    SECTORS.map(() => []));

  check("AD2 — N4, both ways: A then \"Not sure\" is \"Not sure\" alone, and A then ABSENT (undefined, null) is absent alone, in every fixed question that has a \"Not sure\"",
    SECTORS.map(sec => FIXED[sec].map(id => { const q = qOf(sec, id, false); if (!q) return id + " missing";
      const vals = valsOf(q); const unsure = vals.indexOf("unsure") >= 0;
      return vals.every(a => BASES.every(base =>
        (!unsure || noFlags(run(q, base, [a, "unsure"])) === noFlags(run(q, base, ["unsure"]))) &&
        noFlags(run(q, base, [a, undefined])) === noFlags(run(q, base, [undefined])) &&
        noFlags(run(q, base, [a, null])) === noFlags(run(q, base, [null])))); })),
    SECTORS.map(sec => FIXED[sec].map(() => true)));
  check("AD2 — nothing throws on a cleared answer (undefined or null), fresh or after an answer, in any fixed question (S6b and H7a threw)",
    SECTORS.map(sec => FIXED[sec].filter(id => { const q = qOf(sec, id, false);
      return !q || [[undefined], [null], [valsOf(q)[0], undefined], [valsOf(q)[0], null]].some(seq => typeof run(q, BASES[0], seq) === "string"); })),
    SECTORS.map(() => []));

  check("AD3 — a repeated answer does not stack: A twice is A once, whole session (flags included), every fixed question",
    SECTORS.map(sec => mismatches(sec, FIXED[sec], false, (q, base, a) => [J(run(q, base, [a, a])) === J(run(q, base, [a])) ? null : "twice"])),
    SECTORS.map(() => []));

  /* AD4. The fingerprint: sha1 over the single-answer session of every fixed
     question, every option value, three starting sessions, switches off. It
     was computed on "Caprebate site.html.bak-phase132g", the site before this
     phase, and it is identical on the site after - so no answer given once
     sets anything it did not set before. Cleared answers are left out of it
     deliberately: two of them threw before (AD2). */
  const FP_BASES = BASES.concat([() => ({ trigger: ["conversion", "purchase"], deal: "property", flags: [], assumptions: ["an earlier line"],
    lrr: true, claimant_type: "company", dwelling_setting: "dh_multi_selfcontained", acquisition_date: "2019-05-05", grant_answer: "some", nation: "england" })]);
  const fingerprint = () => require("crypto").createHash("sha1").update(SECTORS.map(sec => FIXED[sec].map(id => {
    const q = qOf(sec, id, false); return id + ":" + (q ? valsOf(q).map(v => FP_BASES.map(b => J(run(q, b, [v]))).join("|")).join("||") : "missing"); }).join("\n")).join("\n\n")).digest("hex");
  check("AD4 — a single answer sets exactly what it set before this phase: fingerprint of every fixed question's single-answer session, pinned from the pre-change site",
    fingerprint(), "5b912bf65ecf1d91c25b7bbd0148b42a0b41e189");
  check("AD4 — and every assumption line a single answer gives appears once, every fixed question",
    SECTORS.map(sec => mismatches(sec, FIXED[sec], false, (q, base, a) => { const s = run(q, base, [a]);
      return [typeof s === "string" ? s : (new Set(s.assumptions).size === s.assumptions.length ? null : "duplicate line")]; })),
    SECTORS.map(() => []));

  check("AD5 — generic: EVERY question with an answer handler, all five flows, switches off and all on: A then B equals B alone on facts and assumption lines",
    [false, true].map(on => SECTORS.map(sec => mismatches(sec, (mod(sec, on).Q || []).filter(q => q.onSet).map(q => q.id), on,
      (q, base, a) => valsOf(q).concat([undefined, null]).map(b => { const ab = run(q, base, [a, b]), bb = run(q, base, [b]);
        if (typeof bb === "string" && typeof ab === "string") return null;   /* a handler that needs a fuller session than this throws either way - not this suite's question */
        return noFlags(ab) === noFlags(bb) ? null : "then " + J(b); })))),
    [false, true].map(() => SECTORS.map(() => [])));

  check("AD6 — an unrelated assumption line already on the session is left where it was, every fixed question",
    SECTORS.map(sec => mismatches(sec, FIXED[sec], false, (q, base, a) => valsOf(q).map(b => {
      const s = run(q, () => Object.assign(base(), { assumptions: ["an earlier line"] }), [a, b]);
      return typeof s !== "string" && s.assumptions[0] === "an earlier line" && s.assumptions.filter(x => x === "an earlier line").length === 1 ? null : "then " + J(b); }))),
    SECTORS.map(() => []));
  const PFX = { care_homes: "Q", dental: "D", supported_living: "S", gp: "G", private_hospital: "H" };
  check("AD6 — a purchase date another question set after this one is not cleared when this one changes (the event-date question), all five",
    SECTORS.map(sec => safe(() => { const q = qOf(sec, PFX[sec] + "9d", false); const s = BASES[0]();
      q.onSet(s, "2020-01-01"); s.acquisition_date = "2018-02-02"; q.onSet(s, "2025-06-01"); return [s.event_date, s.acquisition_date]; })),
    SECTORS.map(() => ["2025-06-01", "2018-02-02"]));
  check("AD6 — the flow starts with lrr:false: the derelict-land answer \"yes\" then \"no\", \"Not sure\" or cleared gives lrr:false back, all five",
    SECTORS.map(sec => safe(() => ["no", "unsure", undefined, null].map(v => run(qOf(sec, PFX[sec] + "10c", false), BASES[1], ["yes", v]).lrr))),
    SECTORS.map(() => [false, false, false, false]));
  check("AD6 — S6bl, the shared lounge: \"yes\" then \"no\", \"Not sure\", undefined or null leaves no common-part line and the fact that answer alone gives; \"yes\" twice gives one line (switch on, as the flow asks it)",
    safe(() => { const q = qOf("supported_living", "S6bl", true); const isL = x => /treated as a common part/.test(x);
      return ["no", "unsure", undefined, null].map(v => { const s = run(q, BASES[0], ["yes", v]); return [s.assumptions.filter(isL).length, s.shared_lounge_common]; })
        .concat([run(q, BASES[0], ["yes", "yes"]).assumptions.filter(isL).length]); }),
    [[0, false], [0, null], [0, null], [0, null], 1]);

  const FIG7 = ["QE", "TS", "cash", "cashRoute", "cashBlocked", "cashGates", "pool", "speed", "lrr", "grant", "sipp"];
  const full = sec => ({ sector: sec, trigger: ["purchase"], deal: "property", base_amount: 2000000, claimant_type: "company", claimant_raw: "company",
    activity: "trade", dwelling_setting: "institution_commercial", acuity: "normal", flags: [], assumptions: [], lrr: false, return_in_time: false, nation: "england" });
  /* AD7 leaves "outcome" out on purpose: a stale FLAG (out of scope, see the
     header) still turns an estimate into a referral after, for example, "Not
     sure" then "No" on the funding question. Every figure is asserted. */
  check("AD7 — no figure moves on a change: A then B gives the same figures (outcome aside - it follows the flags) and assumptions from runEngine as B alone, every fixed question, all five",
    SECTORS.map(sec => FIXED[sec].filter(id => { const q = qOf(sec, id, false); const E = mod(sec, false);
      return !q || valsOf(q).some(a => valsOf(q).concat([undefined]).some(b => {
        const r = seq => safe(() => { const s = full(sec); seq.forEach(v => q.onSet(s, v)); const o = E.runEngine(s); return J([FIG7.map(k => o[k]), o.assumptions]); });
        return r([a, b]) !== r([b]); })); })),
    SECTORS.map(() => []));
}


/* =============================================================================
   SUITE AE - PHASE 132h, 16 September 2026. Flags outlive their answer no
   longer; a hidden question keeps nothing; land remediation follows H10c and
   H23 together, in any order.

   Suite AD (Phase 132g) proved a changed answer takes back its facts and
   assumption lines in 36 questions, and left flags out. The Phase 132h audit
   re-derived: 184 questions left a flag behind on a change (A then B kept a
   flag B alone does not raise), 173 of them outside the 36 and 11 inside; no
   question's facts or lines were still stale. H7a and H7b raise the same flag
   text. Flags are also raised outside any question - by the estimate engine,
   through the same pushFlag - and those are never taken back. Every question
   with a handler is now wrapped (answerTakesBack(Q) in each flow); pushFlag
   tells the helper which question raised a flag, and a flag stays while ANY
   question's current answer raises it.

   A HIDDEN QUESTION. Each flow decides visibility with showIf(S) (visible(q)
   in the renderer) and walks forward with nextIndex after every answer. The
   renderer now calls answerHiddenTakesBack(Q, S, q) straight after q.onSet and
   before the gate check: every answered question AFTER q whose showIf is now
   false is taken back - facts, lines, flags and its recorded answer - repeated
   until nothing more hides. The flow never pre-fills an answer, so a question
   shown again is asked afresh. Earlier questions are left alone: the client
   has passed them and the flow never re-asks them, and a fresh run with the
   same answers would have asked them before the later answer existed (Q12b,
   Q12bv, Q14 and Q14fvr read facts the later E-8 questions set, in all five).

     AE0  the switches are off; every flow has the helper; the renderer calls it
          after every answer and before the gate check, in all five.
     AE1  generic, EVERY question with a handler, all five flows, switches off
          and all on: A then B equals B alone on the WHOLE session - facts,
          lines AND flags - with every option, "Not sure", undefined and null
          as B (N4: "Not sure" and absent each asserted as B).
     AE2  and on the estimate: A then B gives the same outcome, flags,
          figures and assumptions from runEngine as B alone, same B's.
     AE3  the funding question in all five: "Not sure" then "No" is an
          estimate, as "No" alone is; "Not sure" alone is a referral.
     AE4  a shared flag: H7a and H7b both raise it - clear either, it stays;
          clear both, it goes; a flag already on the session, or raised by the
          engine, is never taken back.
     AE5  a single answer is unchanged: fingerprint of EVERY question's
          single-answer session (every option, "Not sure", undefined, null;
          three starting sessions; switches off and on), pinned from
          "Caprebate site.html.bak-phase132h".
     AE6  hidden, every conditional question with a handler, all five flows,
          switches off and on, every option: hidden -> the session is exactly
          what it was before the answer; still shown -> untouched; shown again
          and answered -> exactly the single answer; a question before the one
          answered is never taken.
     AE7  hidden, on the flows' own showIf: seeded walks through each flow; for
          every conditional question reached, an earlier answer is changed so
          that it hides - it is taken back, what it set is gone, nothing still
          shown is taken, and changing the earlier answer back and walking
          forward gives the original session again.
     AE8  S6bl by name: its line goes when S6a changes away from
          self-contained homes, and comes back once when asked afresh.
     AE9  H10c with H23: lrr, the polluter marker and line follow the current
          answers in every order and combination, "Not sure" and absent
          included; lrr true (the relieving value) only on a KNOWN H10c "yes".
     AE10 the flow itself: the renderer run whole against a small DOM stub -
          Back, a different answer, Continue - for S6bl and for H10c/H23.
   Nineteen assertions. Fifteen fail against the site as it stood before this
   phase (redirect hook, "Caprebate site.html.bak-phase132h", 3 reads); the
   other four are guards that held before and must keep holding - the switches
   are off, a flag raised outside a question stays, the single-answer
   fingerprint, and N4 on lrr. Every other suite stayed green there.
   A note on H23 that is NOT a change: "Not sure" or no answer to H23 leaves lrr
   on (Phase 132 shipped it so, flagged). lrr on relieves, so this is a relief
   that stands on an unknown - but it follows a KNOWN H10c "yes", and H23 is the
   question that takes it away. Recorded for a decision, README Phase 132h.
   ============================================================================= */
/* The site's own renderer, run whole against a stub page just rich enough to
   press options, Continue and Back (Phase 132h wrote it inside Suite AE;
   Phase 132i hoisted it here so Suite AF drives the same thing). */
function stubFlow(sector, gates, script) { try {
    const start = engineBody.indexOf("/* ===== " + sector + " ===== */"), open = engineBody.indexOf("(function(){", start),
      reg = engineBody.indexOf('RS["' + sector + '"]=', open), close = engineBody.indexOf("})();", reg);
    let layer = engineBody.slice(engineBody.indexOf("var CB_PLANT"), engineBody.indexOf("/* ===== care_homes"));
    gates.forEach(g => { layer = layer.replace(new RegExp("(" + g + "\\s*:\\s*)false", "g"), "$1true"); });
    const els = {};
    const mk = id => { const e = { id, style: {}, dataset: {}, attrs: {}, on: {}, value: "", disabled: false, textContent: "", _html: "", _opts: [],
      addEventListener(ty, f) { (this.on[ty] = this.on[ty] || []).push(f); }, setAttribute(k, v) { this.attrs[k] = v; },
      getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; }, focus() {}, insertAdjacentHTML() {}, querySelector() { return null; },
      querySelectorAll(sel) { return !/^\.opt/.test(sel) ? [] : /aria-pressed="true"/.test(sel) ? this._opts.filter(o => o.attrs["aria-pressed"] === "true") : this._opts; } };
      Object.defineProperty(e, "innerHTML", { get() { return this._html; }, set(h) { this._html = h;
        this._opts = [...h.matchAll(/class="opt[^"]*"[^>]*data-v="([^"]*)"/g)].map(m => { const o = mk(); o.dataset.v = m[1]; return o; });
        Object.keys(els).forEach(k => { if (["stage", "barfill", "stepcount"].indexOf(k) === -1) delete els[k]; }); } });
      return e; };
    const doc = { getElementById: id => (els[id] = els[id] || mk(id)), querySelector: () => null, querySelectorAll: () => [], createElement: () => mk(), addEventListener() {}, body: mk() };
    const M = new Function("__doc", "__win", "var document=__doc,window=__win,RS={},SECTORS={};\n" + layer + "\nreturn (function(){\n" +
      engineBody.slice(open + "(function(){".length, close) + "\n return {RS:RS, S:function(){return S;}, Q:Q, idx:function(){return idx;}, history:function(){return history;}};\n})();")(doc, { addEventListener() {}, location: { href: "" } });
    M.RS[sector]();
    const A = { at: () => M.Q[M.idx()].id, S: () => M.S(), Q: M.Q, history: () => M.history(), backDisabled: () => els.back.disabled, stage: () => els.stage._html, back: () => els.back.onclick(),
      answer(v) { const q = M.Q[M.idx()];
        if (q.type === "single" || q.type === "multi") { const vs = Array.isArray(v) ? v : [v]; els.stage._opts.filter(o => vs.indexOf(o.dataset.v) >= 0).forEach(o => o.on.click.forEach(f => f())); }
        else { els.inp.value = String(v); (els.inp.on.input || []).forEach(f => f()); }
        els.next.onclick(); },
      to(id, pick) { for (let n = 0; n < 120 && A.at() !== id; n++) { const q = M.Q[M.idx()];
        A.answer(pick[q.id] !== undefined ? pick[q.id] : q.opts ? (q.type === "multi" ? [q.opts[0][0]] : q.opts[0][0]) : q.type === "date" ? "2020-01-01" : 1000); }
        if (A.at() !== id) throw new Error("the flow did not reach " + id); } };
    return script(A);
} catch (e) { return "threw: " + e.message; } }

if (startSuite("AE", "Phase 132h — flags taken back, hidden questions, land remediation")) {
  const safe = fn => { try { return fn(); } catch (e) { return "threw: " + e.message; } };
  const PFX = { care_homes: "Q", dental: "D", supported_living: "S", gp: "G", private_hospital: "H" };
  const ALL_GATES = (layerSrc.slice(layerSrc.indexOf("var CB_CTA"), layerSrc.indexOf("};", layerSrc.indexOf("var CB_CTA")))
    .match(/^\s*([a-z0-9_]+)\s*:\s*false/gm) || []).map(x => x.replace(/:.*$/, "").trim());
  const MODS = {}; const mod = (sec, on) => (MODS[sec + on] = MODS[sec + on] || liftGated(sec, on ? ALL_GATES : []));
  const qOf = (sec, id, on) => (mod(sec, on).Q || []).find(q => q.id === id);
  const J = x => JSON.stringify(x, (k, v) => v === undefined ? "__undefined__" : v);
  const BASES = [
    () => ({ trigger: ["purchase"], deal: "property", flags: [], assumptions: [] }),
    () => ({ trigger: [], flags: [], assumptions: [], lrr: false }) ];
  const valsOf = q => q.type === "single" ? q.opts.map(o => o[0])
    : q.type === "multi" ? [[q.opts[0][0]], q.opts.map(o => o[0]), [], [q.opts[q.opts.length - 1][0]]]
    : q.type === "date" ? ["2020-01-01", "2025-06-01"]
    : (q.type === "currency" || q.type === "percent" || q.type === "number") ? [0, 50000, 400000] : ["x"];
  const Bs = q => valsOf(q).concat(["unsure", undefined, null]);
  const run = (q, base, seq) => safe(() => { const s = base(); seq.forEach(v => q.onSet(s, v)); return s; });
  /* each flow's renderer drops its first question (the sector picker, Q.shift()); the package holds only the
     engine half, so it still has it - left out here so both harness modes test the same questions */
  const handlers = (sec, on) => (mod(sec, on).Q || []).filter(q => q.onSet && q.id !== PFX[sec] + "0");

  check("AE0 — every CB_CTA switch is OFF in the layer under test",
    [ALL_GATES.length >= 20, /shared_lounge_claimable\s*:\s*true/.test(layerSrc)], [true, false]);
  check("AE0 — every flow carries the hidden-question helper, and every question with a handler can be taken back",
    SECTORS.map(sec => [typeof mod(sec, false).hide, handlers(sec, false).every(q => typeof q.onSet.takeBack === "function")]),
    SECTORS.map(() => ["function", true]));
  check("AE0 — the renderer of every flow takes back hidden answers straight after the answer and before the gate check",
    SECTORS.map(sec => { const a = engineBody.indexOf("/* ===== " + sec + " ===== */"); const b = engineBody.indexOf('RS["' + sec + '"]=', a);
      const part = engineBody.slice(engineBody.indexOf("//  RENDERER", a), b);
      const i = part.indexOf("if(q.onSet) q.onSet(S,val);\n    answerHiddenTakesBack(Q, S, q);"), g = part.indexOf("if(q.gate)", Math.max(i, 0));
      return [i >= 0, i >= 0 && g > i, (part.match(/answerHiddenTakesBack\(/g) || []).length]; }),
    SECTORS.map(() => [true, true, 1]));

  const bad = (sec, on, cmp) => { const out = [];
    handlers(sec, on).forEach(q => BASES.forEach((base, bi) => valsOf(q).forEach(a => Bs(q).forEach(b => {
      const r = cmp(q, base, a, b); if (r && out.length < 4) out.push(q.id + " base" + bi + " " + J(a) + " then " + J(b) + " " + r); })))); return out; };
  check("AE1 — generic: EVERY question with a handler, all five flows, switches off and all on: A then B equals B alone on the whole session, flags included (every option, \"Not sure\", undefined, null as B)",
    [false, true].map(on => SECTORS.map(sec => bad(sec, on, (q, base, a, b) => { const ab = run(q, base, [a, b]), bb = run(q, base, [b]);
      if (typeof ab === "string" && typeof bb === "string") return null;
      return J(ab) === J(bb) ? null : "differs"; }))),
    [false, true].map(() => SECTORS.map(() => [])));
  check("AE1 — N4 both ways, every question that offers \"Not sure\", all five, switches off: A then \"Not sure\" is \"Not sure\" alone and A then absent (undefined, null) is absent alone, flags included",
    SECTORS.map(sec => handlers(sec, false).filter(q => q.type === "single" && q.opts.some(o => o[0] === "unsure")).filter(q =>
      BASES.some(base => valsOf(q).some(a => ["unsure", undefined, null].some(b => { const ab = run(q, base, [a, b]), bb = run(q, base, [b]);
        return !(typeof ab === "string" && typeof bb === "string") && J(ab) !== J(bb); })))).map(q => q.id)),
    SECTORS.map(() => []));

  const FIG = ["outcome", "QE", "TS", "cash", "cashRoute", "cashBlocked", "cashGates", "pool", "speed", "lrr", "grant", "sipp", "flags", "assumptions"];
  /* plant_serves (Phase 132i): a complete session answers the heating question - absent, supported living is a referral (N4) */
  const full = sec => ({ sector: sec, trigger: ["purchase"], deal: "property", base_amount: 2000000, claimant_type: "company", claimant_raw: "company",
    activity: "trade", dwelling_setting: "institution_commercial", acuity: "normal", flags: [], assumptions: [], lrr: false, return_in_time: false, nation: "england",
    plant_serves: "individual" });
  check("AE2 — and on the estimate: A then B gives the same outcome, figures, flags and assumptions from runEngine as B alone, every question, all five, switches off",
    SECTORS.map(sec => { const E = mod(sec, false), out = [];
      handlers(sec, false).forEach(q => valsOf(q).forEach(a => Bs(q).forEach(b => {
        const r = seq => safe(() => { const s = full(sec); seq.forEach(v => q.onSet(s, v)); const o = E.runEngine(s); return J(FIG.map(k => o[k])); });
        const ab = r([a, b]), bb = r([b]);
        if (ab !== bb && !(ab.indexOf("threw") === 0 && bb.indexOf("threw") === 0) && out.length < 4) out.push(q.id + " " + J(a) + " then " + J(b)); })));
      return out; }),
    SECTORS.map(() => []));

  check("AE3 — the funding question, all five: \"Not sure\" then \"No\" is an estimate, exactly as \"No\" alone; \"Not sure\" alone is a referral",
    /* PHASE 157a, 6 October 2026: the session now names a seller that could never claim and nobody before it who
       could. full() gives no seller at all, and since Phase 157a a purchase whose seller's entitlement is not known has
       nil at the bottom and a flag (Rulebook B, branches B and C undetermined), which is a referral before the funding
       question is read. This check is about the funding question, so it holds the seller fixed. */
    SECTORS.map(sec => safe(() => { const q = qOf(sec, PFX[sec] + "17", false), E = mod(sec, false);
      const o = seq => { const s = Object.assign(full(sec), { prior_owner_entitled: "no", earlier_entitled_owner: "no" }); seq.forEach(v => q.onSet(s, v)); return E.runEngine(s); };
      return [o(["unsure", "no"]).outcome, J(o(["unsure", "no"])) === J(o(["no"])), o(["unsure"]).outcome]; })),
    SECTORS.map(() => ["estimate", true, "referral"]));

  const POOL = f => /^Pool allocation \(main-pool vs special-rate\) on specialist clinical plant/.test(f);
  check("AE4 — a shared flag: H7a and H7b both raise the pool-allocation flag; clear either and it stays, clear both and it goes (both orders, cleared as undefined, null and \"None\")",
    safe(() => { const a = qOf("private_hospital", "H7a", false), b = qOf("private_hospital", "H7b", false);
      const fam = b.opts.map(o => o[0]).filter(x => x !== "none");
      return [undefined, null, ["none"]].map(clr => { const s = () => Object.assign(BASES[0](), { facility: "acute" });
        const x = s(); a.onSet(x, ["theatres"]); b.onSet(x, fam); const both = x.flags.filter(POOL).length;
        a.onSet(x, clr); const afterA = x.flags.filter(POOL).length; b.onSet(x, clr); const afterAB = x.flags.filter(POOL).length;
        const y = s(); a.onSet(y, ["theatres"]); b.onSet(y, fam); b.onSet(y, clr); const afterB = y.flags.filter(POOL).length; a.onSet(y, clr);
        return [both, afterA, afterAB, afterB, y.flags.filter(POOL).length]; }); }),
    [[1, 1, 0, 1, 0], [1, 1, 0, 1, 0], [1, 1, 0, 1, 0]]);
  check("AE4 — a flag already on the session before any question raised it, or raised by the engine, is never taken back",
    SECTORS.map(sec => safe(() => { const q = qOf(sec, PFX[sec] + "17", false), E = mod(sec, false);
      const pre = Object.assign(BASES[0](), {}); q.onSet(pre, "unsure"); const F = pre.flags[0];
      const s1 = BASES[0](); s1.flags.push(F); q.onSet(s1, "unsure"); q.onSet(s1, "no");
      const s2 = full(sec); q.onSet(s2, "unsure"); E.pushFlag ? E.pushFlag(s2, F) : null; q.onSet(s2, "no");
      return [s1.flags.indexOf(F) >= 0, E.pushFlag ? s2.flags.indexOf(F) >= 0 : "no pushFlag"]; })),
    SECTORS.map(() => [true, true]));

  const FP_BASES = BASES.concat([() => ({ trigger: ["conversion", "purchase"], deal: "property", flags: [], assumptions: ["an earlier line"],
    lrr: true, claimant_type: "company", dwelling_setting: "dh_multi_selfcontained", acquisition_date: "2019-05-05", grant_answer: "some", nation: "england" })]);
  /* Phase 132j: CB_AE5_DUMP=<file> writes one line per question (switches, sector, id, the sha1 of its fingerprint),
     so a re-pin can be proved question by question against a pre-change copy served through the redirect hook */
  const AE5_FP = [false, true].map(on => SECTORS.map(sec => handlers(sec, on).map(q =>
      q.id + ":" + Bs(q).map(v => FP_BASES.map(b => J(run(q, b, [v]))).join("|")).join("||"))));
  if (process.env.CB_AE5_DUMP) require("fs").writeFileSync(process.env.CB_AE5_DUMP, [false, true].map((on, oi) => SECTORS.map((sec, si) =>
    AE5_FP[oi][si].map(line => (on ? "on " : "off ") + sec + " " + line.slice(0, line.indexOf(":")) + " " +
      require("crypto").createHash("sha1").update(line).digest("hex")).join("\n")).join("\n")).join("\n") + "\n");
  check("AE5 — a single answer sets exactly what it set before this phase: fingerprint of EVERY question's single-answer session (every option, \"Not sure\", undefined, null; three sessions; switches off and on), pinned from the pre-change site",
    require("crypto").createHash("sha1").update(AE5_FP.map(o => o.map(s => s.join("\n")).join("\n\n")).join("\n\n\n")).digest("hex"),
    /* RE-PINNED BY PHASE 132i, 16 September 2026, from "0dc2de818b99d2387342700cb91bb2e33d70c7ab". Compared question by
       question against Caprebate site.html.bak-phase132i, switches off and on: all 442 questions still present give
       byte-identical single-answer sessions. The hash moved only because five questions were retired (Q51eeo, D51eeo,
       S51eeo, G51eeo, H51eeo) and two moved in the list (x51barred before x12b, x51gtr after x17r). */
    /* RE-PINNED BY PHASE 132j, 16 September 2026, from "fdf53689649ea8dd1e2d826434a300b2eac593aa". Proved question by
       question with CB_AE5_DUMP against Caprebate site.html.bak-phase132j served through the redirect hook (3 reads),
       switches off and on: all 442 questions present before give byte-identical single-answer sessions; the only
       lines that differ are the four new polluter questions (Q23, D23, S23, G23), 892 lines against 884. */
    /* RE-PINNED BY PHASE 153b, 4 October 2026, from "cb7dbb6f3a3d03e90e97f88b88e898da90fa6173". Proved question by
       question with CB_AE5_DUMP against Caprebate site.html.bak-phase153b served through the redirect hook (1 read),
       switches off and on: 904 lines against 892, and every line present before is byte-identical except these, each
       intended. Gone: x51barred in all five flows, off and on (Word question 73 - the extra seller question retired).
       New: x51elcost (EL-C2, Word question 98) and x51vatfee (Word question 226) in all five, off and on, and S51slcp
       (Word question 86). Changed, off and on: the works-VAT question (Q18, D18, S18, G19, H18), which now also keeps
       its answer as works_vat. Changed with switches on only: the seller question (x12), which raises the E-8 evidence
       flag the retired question raised, and S17, which offers the registered-provider answer (Word question 108). */
    /* RE-PINNED BY PHASE 157a, 6 October 2026, from "25bac5481c4b4f8421d45dc26d52b41946a960b6". Proved question by
       question with CB_AE5_DUMP against Caprebate site.html.bak-phase157a served through the redirect hook (3 reads),
       switches off and on: 904 lines against 904, and the two dumps SORTED are identical - every question gives a
       byte-identical single-answer session. The hash moved only because x14pod (all five flows, off and on) now comes
       before x14fvr instead of after x14pold: the pooling nil needs the date before the questions it hides. */
    "c69430ae6e195f57a373ce2572869189505f47ff");

  const conds = (sec, on) => handlers(sec, on).filter(q => typeof q.showIf === "function");
  check("AE6 — hidden, every conditional question with a handler, all five, switches off and on, every option: hidden gives back the session as it was before the answer; still shown is untouched; shown again and answered is the single answer; a question before the one answered is never taken",
    [false, true].map(on => SECTORS.map(sec => { const M = mod(sec, on), out = [];
      conds(sec, on).forEach(q => BASES.forEach((base, bi) => valsOf(q).forEach(a => { const r = safe(() => {
        if (typeof M.hide !== "function") return "no helper";
        const s = base(), before = J(s); q.onSet(s, a); const once = J(s);
        if (M.hide([{ id: q.id, showIf: () => true, onSet: q.onSet }], s).length || J(s) !== once) return "shown was touched";
        const later = { id: "__later" };
        if (M.hide([{ id: q.id, showIf: () => false, onSet: q.onSet }, later], s, later).length || J(s) !== once) return "an earlier question was taken";
        if (M.hide([{ id: q.id, showIf: () => false, onSet: q.onSet }], s).join() !== q.id || J(s) !== before) return "hidden left something";
        q.onSet(s, a); return J(s) === once ? null : "shown again differs"; });
        if (r && out.length < 4) out.push(q.id + " base" + bi + " " + J(a) + " " + r); })));
      return out; })),
    [false, true].map(() => SECTORS.map(() => [])));

  /* AE7 - the flows' own showIf. A seeded walk answers each flow front to back,
     picking among the answers that do not end the flow; for every conditional
     question it reached, the earlier answers that wrote a fact its showIf reads
     are changed one value at a time until one hides it. */
  const vis = (q, s) => { try { return !q.showIf || !!q.showIf(s); } catch (e) { return false; } };
  const fresh = () => ({ trigger: [], flags: [], assumptions: [], lrr: false });
  const walkCheck = (sec, on, WALKS) => {
    const M = mod(sec, on); if (typeof M.hide !== "function") return { reached: 0, bad: ["no helper"] };
    let seed = 20260916; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const play = (ans, skip, cap) => { const s = fresh(); let fp = null;
      for (const a of ans) { if (a.i === skip) continue; const q = M.Q[a.i]; if (!vis(q, s)) continue;
        const k0 = {}; Object.keys(s).forEach(k => k0[k] = J(s[k])); const l0 = s.assumptions.slice(), f0 = s.flags.slice();
        q.onSet(s, a.v);
        if (a.i === cap) fp = { keys: Object.keys(s).concat(Object.keys(k0)).filter(k => k !== "flags" && k !== "assumptions" && k0[k] !== J(s[k])),
          lines: s.assumptions.filter(x => l0.indexOf(x) === -1), flags: s.flags.filter(x => f0.indexOf(x) === -1) };
        M.hide(M.Q, s, q); }
      return { s, fp }; };
    const norm = s => { const o = Object.assign({}, s), k = {}; delete o.flags; delete o.assumptions; Object.keys(o).sort().forEach(x => k[x] = o[x]);
      return J([k, s.assumptions.slice().sort(), s.flags.slice().sort()]); };
    const reached = {}, badOut = [];
    for (let w = 0; w < WALKS; w++) {
      const s = fresh(), ans = [], wrote = {};
      for (let i = 0; i < M.Q.length; i++) { const q = M.Q[i]; if (!q.onSet || q.id === PFX[sec] + "0" || !vis(q, s)) continue;
        const vs = valsOf(q).slice(); for (let k = vs.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [vs[k], vs[j]] = [vs[j], vs[k]]; }
        let chosen = false;
        for (const v of vs) { const pre = {}; Object.keys(s).forEach(k => pre[k] = J(s[k]));
          try { q.onSet(s, v); } catch (e) { continue; }
          let t = null; try { t = q.gate && q.gate(s, v); } catch (e) { t = true; }
          if (t) { q.onSet.takeBack(s); M.hide(M.Q, s, q); continue; }
          Object.keys(s).concat(Object.keys(pre)).forEach(k => { if (pre[k] !== J(s[k])) (wrote[k] = wrote[k] || []).push(i); });
          const hidden = M.hide(M.Q, s, q);
          if (hidden.some(id => vis(M.Q.find(x => x.id === id), s))) badOut.push(q.id + " took back a question still shown");
          ans.push({ i, v }); chosen = true; break; }
        if (!chosen) break; }
      let once = null, firstNorm = null;
      for (const qa of ans) { const q = M.Q[qa.i]; if (!q.showIf || reached[q.id]) continue;
        once = once || play(ans).s;
        const reads = new Set(); try { q.showIf(new Proxy(once, { get(o, k) { reads.add(k); return o[k]; } })); } catch (e) {}
        const cands = [...new Set([...reads].flatMap(k => wrote[k] || []))].filter(i => i < qa.i).sort((a, b) => b - a);
        search: for (const pi of cands) { const pa = ans.find(a => a.i === pi), p = M.Q[pi]; if (!pa) continue;
          for (const nv of valsOf(p)) { if (J(nv) === J(pa.v)) continue;
            /* a cheap look first, on a plain copy, before the full replays: does this change hide it at all? */
            if (safe(() => { const look = JSON.parse(JSON.stringify(once)); p.onSet(look, nv); return vis(q, look); }) === true) continue;
            const r = safe(() => {
              const { s: s2, fp } = play(ans, -1, qa.i); if (!fp || !vis(q, s2)) return "skip";
              /* two references, either of which it must equal: the flow walked once (a fresh run of the same
                 answers), and the same session walked forward again from the earlier answer, unchanged. They can
                 differ because some handlers read an answer given AFTER them (the fixed-value window reads the
                 intervening owner), so a second pass forward is not always the first */
              const first = firstNorm = firstNorm || norm(once);
              const ref = play(ans).s; p.onSet(ref, pa.v); M.hide(M.Q, ref, p);
              for (const a of ans) { if (a.i <= pi) continue; const qq = M.Q[a.i]; if (vis(qq, ref)) { qq.onSet(ref, a.v); M.hide(M.Q, ref, qq); } }
              const orig = norm(ref);
              p.onSet(s2, nv); const taken = M.hide(M.Q, s2, p); if (vis(q, s2)) return "skip";
              const c = play(ans, qa.i).s; p.onSet(c, nv); M.hide(M.Q, c, p);
              const errs = [];
              if (taken.indexOf(q.id) === -1) errs.push("not taken back");
              if (taken.some(id => vis(M.Q.find(x => x.id === id), s2))) errs.push("took back a question still shown");
              fp.keys.forEach(k => { if (J(s2[k]) !== J(c[k])) errs.push("fact " + k + " left"); });
              fp.lines.forEach(x => { if (s2.assumptions.filter(y => y === x).length !== c.assumptions.filter(y => y === x).length) errs.push("line left"); });
              fp.flags.forEach(x => { if ((s2.flags.indexOf(x) >= 0) !== (c.flags.indexOf(x) >= 0)) errs.push("flag left"); });
              p.onSet(s2, pa.v); M.hide(M.Q, s2, p);
              for (const a of ans) { if (a.i <= pi) continue; const qq = M.Q[a.i]; if (vis(qq, s2)) { qq.onSet(s2, a.v); M.hide(M.Q, s2, qq); } }
              if (norm(s2) !== orig && norm(s2) !== first) errs.push("shown again and answered forward, neither the flow walked once nor walked forward again without the change");
              return errs; });
            if (r === "skip") continue;
            reached[q.id] = true;
            if (typeof r === "string") badOut.push(q.id + " " + r); else if (r.length) badOut.push(q.id + " via " + p.id + " " + J(pa.v) + "->" + J(nv) + ": " + r.join(", "));
            break search; } } } }
    return { reached: Object.keys(reached).length, of: conds(sec, on).length, bad: badOut.slice(0, 6), unreached: conds(sec, on).map(q => q.id).filter(id => !reached[id]) };
  };
  /* measured on 16 September 2026 with this seed and 150 walks; a change that reaches fewer fails here. Off and on
     together the walks reach 315 of the 351. Of the 36 they do not: 12 are shown by a switch alone (the five
     provision-of and five s.33B questions, S51ssh, S51slc) and 7 by a fact every hospital answer sets (H7b and the
     six H7c parts read facility), so no answer can hide them; Q0a reads the sector the flow sets on entry; the five
     E-8 seller questions hide themselves once answered and are kept by their own-answer rule; the five return
     fallbacks (Q19, D20, S19, G20, H20) show only when a date is left blank, which the walks never do; and six are
     not reached - S6bl (asserted by name in AE8), Q51gtr and S51gtr (they read the grant share, asked later), H51resp,
     H14rsv and D14ta. Run with CB_AE7_UNREACHED=1 to list them.
     RE-MEASURED BY PHASE 132i, 16 September 2026, same seed and walks: off unchanged; on care homes 61 of 68, dental
     59 of 66, supported living 57 of 63, GP 66 of 69, private hospital 69 of 80. The five x51eeo questions were retired
     and x51barred and x51gtr moved in the list (CB_CTAQ.place), so the seeded walks draw their answers in a different
     order: two flows reach more, two fewer. S51gtr now follows the grant share it reads and is reached; Q51gtr also
     needs a letting care home with self-contained units, and is not. */
  /* RE-MEASURED BY PHASE 153b, 4 October 2026, same seed and walks, against .bak-phase153b served through the
     redirect hook and against the changed site: off unchanged (44, 40, 37, 46, 41); on care homes 62 -> 64, dental
     59 -> 60, supported living 58 -> 59, GP 66 -> 66, private hospital 69 -> 68. The five x51barred questions were
     retired (Word question 73) - H51barred was one the walks reached - and x51elcost, x51vatfee and S51slcp added, so
     the walks draw in a different order. The private-hospital floor moves down by exactly that one question. */
  const AE7_FLOOR = { "off:care_homes": 43, "off:dental": 35, "off:supported_living": 36, "off:gp": 45, "off:private_hospital": 41,
                      "on:care_homes": 61, "on:dental": 59, "on:supported_living": 57, "on:gp": 66, "on:private_hospital": 68 };
  const WALK = {}; [false, true].forEach(on => SECTORS.forEach(sec => { WALK[sec + on] = walkCheck(sec, on, 150); }));
  console.log("         conditional questions reached and hidden by the walks (switches off | on): " +
    SECTORS.map(sec => sec + " " + WALK[sec + false].reached + "/" + WALK[sec + false].of + " | " + WALK[sec + true].reached + "/" + WALK[sec + true].of).join(", "));
  if (process.env.CB_AE7_UNREACHED) [false, true].forEach(on => SECTORS.forEach(sec => console.log("         unreached " + (on ? "on " : "off ") + sec + ": " + WALK[sec + on].unreached.join(" "))));
  check("AE7 — on the flows' own showIf, all five, switches off and on: every conditional question reached and hidden by changing an earlier answer is taken back, leaves nothing it set, takes nothing still shown, and comes back whole when the earlier answer is changed back and the flow walked forward",
    [false, true].map(on => SECTORS.map(sec => WALK[sec + on].bad)), [false, true].map(() => SECTORS.map(() => [])));
  check("AE7 — and the walks reach at least this many conditional questions (of those with a handler), so the check cannot quietly go blind",
    [false, true].map(on => SECTORS.map(sec => WALK[sec + on].reached >= AE7_FLOOR[(on ? "on:" : "off:") + sec])),
    [false, true].map(() => SECTORS.map(() => true)));

  check("AE8 — S6bl, the shared lounge (its switch on, as the flow asks it): its line and fact go when S6a changes away from self-contained homes, the flag of a \"Not sure\" too; asked afresh, \"yes\" gives the line once",
    safe(() => { const M = liftGated("supported_living", ["shared_lounge_claimable"]); const a = M.Q.find(q => q.id === "S6a"), b = M.Q.find(q => q.id === "S6bl");
      const isL = x => /treated as a common part/.test(x), isF = x => /^Shared lounge\/kitchen outside the homes unconfirmed/.test(x);
      return ["yes", "unsure"].map(v => { const s = fresh();
        a.onSet(s, "selfcontained"); M.hide(M.Q, s, a); const shown = b.showIf(s); b.onSet(s, v); M.hide(M.Q, s, b);
        const set = [s.assumptions.filter(isL).length, s.flags.filter(isF).length, "shared_lounge_common" in s];
        a.onSet(s, "shared"); const taken = M.hide(M.Q, s, a);
        const gone = [b.showIf(s), taken.indexOf("S6bl") >= 0, s.assumptions.filter(isL).length, s.flags.filter(isF).length, "shared_lounge_common" in s];
        a.onSet(s, "selfcontained"); M.hide(M.Q, s, a); b.onSet(s, "yes"); M.hide(M.Q, s, b);
        return [shown, set, gone, s.assumptions.filter(isL).length, s.flags.filter(isF).length, s.shared_lounge_common]; }); }),
    [[true, [1, 0, true], [false, true, 0, 0, false], 1, 0, true], [true, [0, 1, true], [false, true, 0, 0, false], 1, 0, true]]);

  /* AE9 - land remediation. lrr true shows the extra relief; it is the value
     that relieves, so it may follow only a KNOWN H10c "yes" (N4). */
  const LRR_MSG = "The extra relief for land remediation is only available where the contamination was someone else’s. That doesn’t affect the rest of the assessment.";
  const H = id => qOf("private_hospital", id, false), HM = () => mod("private_hospital", false);
  const VALS = ["yes", "no", "unsure", undefined, null];
  const lrrState = s => [!!s.lrr, s.lrr_removed_by_polluter === true, s.assumptions.filter(x => x === LRR_MSG).length];
  check("AE9 — H10c \"yes\", H23 \"yes\", then H10c \"no\": lrr false, no marker, no line, H23 hidden and taken back by the flow; H23 then answered \"no\" does not bring lrr back",
    safe(() => { const s = Object.assign(fresh(), { claimant_type: "company", trigger: ["purchase"] });
      H("H10c").onSet(s, "yes"); HM().hide(HM().Q, s, H("H10c")); H("H23").onSet(s, "yes"); HM().hide(HM().Q, s, H("H23"));
      H("H10c").onSet(s, "no"); const taken = HM().hide(HM().Q, s, H("H10c"));
      const a = [lrrState(s), H("H23").showIf(s), taken, "lrr_polluter" in s];
      H("H23").onSet(s, "no"); return a.concat([s.lrr]); }),
    [[false, false, 0], false, ["H23"], false, false]);
  const orders = [
    (x, y) => [["H10c", x], ["H23", y]], (x, y) => [["H23", y], ["H10c", x]],
    (x, y) => [["H10c", "yes"], ["H23", y], ["H10c", x]], (x, y) => [["H10c", x], ["H23", "yes"], ["H23", y]],
    (x, y) => [["H23", "yes"], ["H10c", "yes"], ["H10c", x], ["H23", y]], (x, y) => [["H10c", "no"], ["H23", "no"], ["H10c", x], ["H23", y]] ];
  check("AE9 — every order and every combination (yes, no, \"Not sure\", undefined, null), with and without the flow's hidden take-back, two starting sessions: lrr is on exactly when H10c is a KNOWN \"yes\" and H23 is not a KNOWN \"yes\"; the marker and line exactly when both are \"yes\"",
    safe(() => { const out = [];
      [() => Object.assign(fresh(), { claimant_type: "company", trigger: ["purchase"] }), () => ({ claimant_type: "company", trigger: ["purchase"], flags: [], assumptions: [] })].forEach((base, bi) =>
        [false, true].forEach(flow => orders.forEach((o, oi) => VALS.forEach(x => VALS.forEach(y => {
          const s = base(); o(x, y).forEach(([id, v]) => { H(id).onSet(s, v); if (flow) HM().hide(HM().Q, s, H(id)); });
          const want = flow ? [x === "yes" && y !== "yes", x === "yes" && y === "yes", x === "yes" && y === "yes" ? 1 : 0]
                            : [x === "yes" && y !== "yes", x === "yes" && y === "yes", x === "yes" && y === "yes" ? 1 : 0];
          if (J(lrrState(s)) !== J(want) && out.length < 6) out.push("base" + bi + (flow ? " flow" : "") + " order" + oi + " H10c=" + J(x) + " H23=" + J(y) + " got " + J(lrrState(s))); })))));
      return out; }),
    []);
  check("AE9 — N4: with H10c \"Not sure\", cleared or never answered, lrr is never turned on, whatever H23 says or in what order",
    safe(() => ["unsure", undefined, null, "unanswered"].map(x => VALS.concat(["unanswered"]).map(y => [0, 1].map(o => {
      const s = Object.assign(fresh(), { claimant_type: "company", trigger: ["purchase"] });
      const seq = [["H10c", x], ["H23", y]].filter(p => p[1] !== "unanswered"); (o ? seq.reverse() : seq).forEach(([id, v]) => H(id).onSet(s, v));
      return !!s.lrr; }))).flat(2).some(Boolean)),
    false);

  /* AE10 - THE FLOW ITSELF. The renderer is DOM code and is not lifted anywhere
     else in this file; here it is run whole, on the site's own text in both
     harness modes, against a stub just rich enough to press options, Continue
     and Back. That is the normal path the client takes: Back to an earlier
     question, a different answer, Continue. */
  const flow = stubFlow;   /* Phase 132i - hoisted to stubFlow above Suite AE, so Suite AF drives the same renderer */
  check("AE10 — through the flow itself (supported living, its lounge switch on): S6a self-contained, S6bl \"yes\", Back twice, S6a shared, Continue - the lounge line and fact are gone and the flow moves on past S6bl",
    flow("supported_living", ["shared_lounge_claimable"], A => { const isL = x => /treated as a common part/.test(x);
      A.to("S6a", { S1: "company", S4: "care", S6: "supported" }); A.answer("selfcontained"); const asked = A.at(); A.answer("yes");
      const set = A.S().assumptions.filter(isL).length; A.back(); A.back(); const backAt = A.at(); A.answer("shared");
      return [asked, set, backAt, A.at(), A.S().assumptions.filter(isL).length, "shared_lounge_common" in A.S()]; }),
    ["S6bl", 1, "S6a", "S6b", 0, false]);
  check("AE10 — through the flow itself (private hospital): H10c \"yes\", H23 \"yes\", Back to H10c, \"no\", Continue - lrr stays off, the polluter answer, marker and line are gone, and H23 is not asked again",
    flow("private_hospital", [], A => {
      A.to("H10c", { H1: "company", H8: ["purchase", "refurb"] }); A.answer("yes"); const lrrOn = A.S().lrr; const at23 = A.at(); A.answer("yes");
      A.back(); A.back(); const backAt = A.at(); A.answer("no"); const s = A.S();
      return [lrrOn, at23, backAt, A.at() !== "H23", s.lrr, "lrr_removed_by_polluter" in s, "lrr_polluter" in s, s.assumptions.indexOf(LRR_MSG)]; }),
    [true, "H23", "H10c", true, false, false, false, -1]);
}


if (startSuite("AF", "Phase 132i — unknowns that relieved on routing, answers read before they are given, Back onto a hidden question")) {
  const safe = fn => { try { return fn(); } catch (e) { return "threw: " + e.message; } };
  const PFX = { care_homes: "Q", dental: "D", supported_living: "S", gp: "G", private_hospital: "H" };
  const ALL_GATES = (layerSrc.slice(layerSrc.indexOf("var CB_CTA"), layerSrc.indexOf("};", layerSrc.indexOf("var CB_CTA")))
    .match(/^\s*([a-z0-9_]+)\s*:\s*false/gm) || []).map(x => x.replace(/:.*$/, "").trim());
  const MODS = {}; const mod = (sec, on) => (MODS[sec + on] = MODS[sec + on] || liftGated(sec, on ? ALL_GATES : []));
  const qOf = (sec, id, on) => (mod(sec, on).Q || []).find(q => q.id === id);
  const J = x => JSON.stringify(x, (k, v) => v === undefined ? "__undefined__" : v);
  const FIG = ["QE", "TS", "cash", "cashRoute", "cashBlocked", "cashGates", "pool", "speed", "grant", "sipp"];
  const sorted = a => (a || []).slice().sort();

  /* AF1 - line 1. The heating question in supported living. */
  const SL = on => ({ sector: "supported_living", trigger: ["purchase"], deal: "property", base_amount: 2000000, claimant_type: "company", claimant_raw: "company",
    activity: "trade", dwelling_setting: "dh_multi_selfcontained", flags: [], assumptions: [], lrr: false, return_in_time: false, nation: "england" });
  const slRun = (on, seq) => safe(() => { const s = SL(on), q = qOf("supported_living", "S6c", on); seq.forEach(v => q.onSet(s, v)); return mod("supported_living", on).runEngine(s); });
  const slKey = r => typeof r === "string" ? r : J([r.outcome, sorted(r.flags), sorted(r.assumptions), FIG.map(k => r[k])]);
  const PLANT_FLAG = "Heating arrangement unconfirmed — central plant assumed excluded";
  check("AF1 — S6c, switches off and on: \"Not sure\", never answered, cleared to undefined and to null all give the same outcome (a referral), the same flags and the same assumption lines, and the same figures (N4, both forms)",
    [false, true].map(on => { const u = slKey(slRun(on, ["unsure"]));
      return [slRun(on, ["unsure"]).outcome, [[], [undefined], [null], ["central", undefined], ["individual", null], ["unsure", undefined]].map(seq => slKey(slRun(on, seq)) === u)]; }),
    [false, true].map(() => ["referral", [true, true, true, true, true, true]]));
  check("AF1 — S6c: a known answer still decides - \"individual\" an estimate with no heating flag or line; \"central\" and \"mixed\" the exclusion line unflagged; and absent carries the flag exactly once",
    [false, true].map(on => { const r = seq => slRun(on, seq); const line = x => (x.assumptions || []).filter(a => /central plant serving the homes excluded/.test(a));
      return [r(["individual"]).outcome, line(r(["individual"])).length, r(["central"]).flags.indexOf(PLANT_FLAG), line(r(["mixed"])).length,
              r([]).flags.filter(f => f === PLANT_FLAG).length, line(r([])).length]; }),
    [false, true].map(() => ["estimate", 0, -1, 1, 1, 1]));
  check("AF1 — S6c: the engine writes nothing onto the session for an absent answer - a later \"individual\" is an estimate",
    safe(() => { const s = SL(false), E = mod("supported_living", false), q = qOf("supported_living", "S6c", false);
      const first = E.runEngine(s).outcome; q.onSet(s, "individual"); return [first, E.runEngine(s).outcome, s.flags.indexOf(PLANT_FLAG)]; }),
    ["referral", "estimate", -1]);

  /* AF2 - line 2. The polluter question in private hospitals. */
  const PH = () => ({ sector: "private_hospital", trigger: ["purchase", "refurb"], deal: "property", base_amount: 2000000, claimant_type: "company", claimant_raw: "company",
    facility: "acute", flags: [], assumptions: [], lrr: false, return_in_time: false, nation: "england" });
  const phRun = (on, h23) => safe(() => { const s = PH(), E = mod("private_hospital", on);
    qOf("private_hospital", "H10c", on).onSet(s, "yes"); if (h23 !== "unanswered") qOf("private_hospital", "H23", on).onSet(s, h23);
    const r = E.runEngine(s); return { lrr: r.lrr, asks: !!qOf("private_hospital", "H23", on).showIf(s), fig: J(FIG.map(k => r[k])) }; });
  const H23S = ["no", "yes", "unsure", undefined, null, "unanswered"];
  check("AF2 — H23 after a known H10c \"yes\", switches off and on: the land remediation panel shows only on a KNOWN \"no\"; \"Not sure\", cleared (undefined, null) and never answered leave it off (N4, both forms), and H23 is still asked on all but a known \"yes\"",
    [false, true].map(on => H23S.map(v => { const x = phRun(on, v); return [x.lrr, x.asks]; })),
    [false, true].map(() => [[true, true], [false, true], [false, true], [false, true], [false, true], [false, true]]));
  check("AF2 — H23: no figure moves with the answer - every answer gives the figures of a known \"no\"",
    [false, true].map(on => H23S.map(v => phRun(on, v).fig === phRun(on, "no").fig)),
    [false, true].map(() => H23S.map(() => true)));

  /* AF3 - line 3. One pass forward equals two. A seeded walk answers each flow
     front to back as the renderer does (a question is asked only while shown;
     after each answer, what it hides later in the flow is taken back), choosing
     answers that do not end the flow. The same session is then walked forward
     again with the same answers, and a third time. The questions asked, the
     session (flags and lines as sets) and the estimate must be the same after
     every pass. */
  const valsOf = q => q.type === "single" ? q.opts.map(o => o[0])
    : q.type === "multi" ? [[q.opts[0][0]], q.opts.map(o => o[0]), [q.opts[q.opts.length - 1][0]]]
    : q.type === "date" ? ["2016-03-01", "2020-01-01", "2025-06-01"]
    : (q.type === "currency" || q.type === "percent" || q.type === "number") ? [0, 30, 50000, 400000] : ["x"];
  const vis = (q, s) => { try { return !q.showIf || !!q.showIf(s); } catch (e) { return false; } };
  const norm = s => { const o = Object.assign({}, s), k = {}; delete o.flags; delete o.assumptions; Object.keys(o).sort().forEach(x => k[x] = o[x]);
    return J([k, sorted(s.assumptions), sorted(s.flags)]); };
  const passCheck = (sec, on, WALKS) => {
    const M = mod(sec, on), bad = []; let seed = 20260916 + (on ? 7 : 0);
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    let asked1 = 0;
    for (let w = 0; w < WALKS; w++) {
      const s = { trigger: [], flags: [], assumptions: [], lrr: false, sector: sec }, pick = {};
      const pass = () => { const asked = [];
        for (const q of M.Q) { if (!q.onSet || q.id === PFX[sec] + "0" || !(vis(q, s) || (q.onSet.shownWithoutOwn && q.onSet.shownWithoutOwn(s, q.showIf)))) continue;   /* askable, as the renderer */
          let vs; if (q.id in pick) vs = [pick[q.id]]; else { vs = valsOf(q).slice(); for (let k = vs.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [vs[k], vs[j]] = [vs[j], vs[k]]; } }
          let chosen = false;
          for (const v of vs) { try { q.onSet(s, v); } catch (e) { continue; }
            M.hide(M.Q, s, q);
            let t = null; try { t = q.gate && q.gate(s, v); } catch (e) { t = true; }
            if (t && !(q.id in pick)) { q.onSet.takeBack(s); M.hide(M.Q, s, q); continue; }
            if (t) { asked.push(q.id + " ENDED"); return asked; }
            pick[q.id] = v; asked.push(q.id); chosen = true; break; }
          if (!chosen) { asked.push(q.id + " NO ANSWER"); return asked; } }
        return asked; };
      const est = () => safe(() => { const r = M.runEngine(JSON.parse(JSON.stringify(s))); return J([r.outcome, sorted(r.flags), sorted(r.assumptions), FIG.map(k => r[k]), r.lrr]); });
      const a1 = pass(), n1 = norm(s), e1 = est(); asked1 += a1.length;
      const a2 = pass(), n2 = norm(s), e2 = est();
      const a3 = pass(), n3 = norm(s), e3 = est();
      const diff = (x, y) => { const X = JSON.parse(x), Y = JSON.parse(y), keys = [...new Set(Object.keys(X[0]).concat(Object.keys(Y[0])))];
        return keys.filter(k => J(X[0][k]) !== J(Y[0][k])).concat(J(X[1]) !== J(Y[1]) ? ["lines"] : [], J(X[2]) !== J(Y[2]) ? ["flags"] : []).join(","); };
      if (J(a1) !== J(a2)) bad.push("walk " + w + " asked " + a1.filter(x => a2.indexOf(x) === -1).join(" ") + " | " + a2.filter(x => a1.indexOf(x) === -1).join(" "));
      else if (n1 !== n2) bad.push("walk " + w + " session after two passes differs: " + diff(n1, n2));
      else if (e1 !== e2) bad.push("walk " + w + " estimate after two passes differs");
      else if (J(a2) !== J(a3) || n2 !== n3 || e2 !== e3) bad.push("walk " + w + " third pass differs");
    }
    return { bad: bad.slice(0, 4), asked: asked1 };
  };
  const SECS = ["care_homes", "dental", "supported_living", "gp", "private_hospital"];
  const PASSES = {}; [false, true].forEach(on => SECS.forEach(sec => { PASSES[sec + on] = passCheck(sec, on, 60); }));
  console.log("         questions asked over the first passes (switches off | on): " + SECS.map(sec => sec + " " + PASSES[sec + false].asked + " | " + PASSES[sec + true].asked).join(", "));
  check("AF3 — one pass equals two, and two equal three: all five flows, switches off and on, 60 seeded walks each - the questions asked, the session and the estimate",
    [false, true].map(on => SECS.map(sec => PASSES[sec + on].bad)), [false, true].map(() => SECS.map(() => [])));
  /* measured 16 September 2026: the fewest is dental with its switches off, 1,506 questions over 60 first passes */
  check("AF3 — and the walks answer at least 25 questions a walk on average in every flow, so the check cannot quietly go blind",
    [false, true].map(on => SECS.map(sec => PASSES[sec + on].asked >= 25 * 60)), [false, true].map(() => SECS.map(() => true)));
  check("AF3 — the questions that read an answer given after them, named: the grant-share question now follows the grant amount; the seller question now precedes the earlier-owner question",
    [["care_homes", "Q"], ["supported_living", "S"]].map(([sec, p]) => { const Q = mod(sec, true).Q, at = id => Q.findIndex(q => q.id === id);
      /* Phase 153b: x51barred is retired (Word question 73); the seller question x12 still comes before x12b */
      return [at(p + "51gtr") === at(p + "17r") + 1, Q[at(p + "51gtr")].group === Q[at(p + "17r")].group, at(p + "51barred") === -1 && at(p + "12") < at(p + "12b")]; }),
    [[true, true, true], [true, true, true]]);
  check("AF3 — x14fvr is worked out from the CURRENT intervening-owner answer, however late it is given: answered before x14iv, and before x14iv changes, it ends as if answered after (all five flows)",
    SECS.map(sec => safe(() => { const p = PFX[sec], M = mod(sec, false), fvr = qOf(sec, p + "14fvr", false), iv = qOf(sec, p + "14iv", false), poe = qOf(sec, p + "12", false);
      const base = () => ({ trigger: ["purchase"], deal: "property", flags: [], assumptions: [], lrr: false, sector: sec });
      return ["yes", "no", "unsure"].map(ivv => { const early = base(), late = base();
        poe.onSet(early, "unsure"); fvr.onSet(early, "yes"); iv.onSet(early, "no"); iv.onSet(early, ivv);
        poe.onSet(late, "unsure"); iv.onSet(late, ivv); fvr.onSet(late, "yes");
        return norm(early) === norm(late); }); })),
    SECS.map(() => [true, true, true]));
  check("AF3 — x9d's fallback purchase date follows x14d: given, it wins; taken back, the event date comes back - whichever pass set it",
    SECS.map(sec => safe(() => { const p = PFX[sec], d9 = qOf(sec, p + "9d", false), d14 = qOf(sec, p + "14d", false);
      const s = { trigger: ["purchase"], deal: "property", flags: [], assumptions: [], lrr: false };
      d9.onSet(s, "2020-01-01"); d14.onSet(s, "2019-06-30"); const a = s.acquisition_date;
      d9.onSet(s, "2020-01-01"); d14.onSet(s, "2019-06-30"); const b = s.acquisition_date;
      d14.onSet.takeBack(s); return [a, b, s.acquisition_date]; })),
    SECS.map(() => ["2019-06-30", "2019-06-30", "2020-01-01"]));

  /* AF4 - line 4. Back never lands on a question a later answer has hidden,
     through the site's own renderer in all five flows. The stub hides the
     question two back by a fact the next answer sets, as a question reading a
     later answer did; Back must step over it to the one before. A question
     hidden only by its own answer is still one Back returns to. */
  check("AF4 — through the flow itself, all five: three questions answered, the middle one then hidden by a later fact - Back lands on the last, Back again skips the hidden one to the first; with only hidden questions behind, Back is disabled and stays put",
    SECS.map(sec => stubFlow(sec, [], A => {
      const at0 = A.at(), i0 = A.Q.findIndex(q => q.id === at0);
      const pickFor = q => q.opts ? (q.type === "multi" ? [q.opts[0][0]] : q.opts[q.opts.length - 1][0] === "unsure" ? q.opts[0][0] : q.opts[0][0]) : q.type === "date" ? "2020-01-01" : 1000;
      const ids = [];
      for (let n = 0; n < 3; n++) { ids.push(A.at()); A.answer(pickFor(A.Q[A.Q.findIndex(q => q.id === A.at())])); }
      const mid = A.Q.find(q => q.id === ids[1]), orig = mid.showIf;
      mid.showIf = s => s.__af4_hidden !== true && (!orig || orig(s));
      A.S().__af4_hidden = true;
      const disabledBefore = A.backDisabled();
      A.back(); const b1 = A.at(); A.back(); const b2 = A.at();
      const disabledAtFirst = A.backDisabled();
      mid.showIf = orig;
      return [i0 >= 0, disabledBefore, b1 === ids[2], b2 === ids[0], disabledAtFirst]; })),
    SECS.map(() => [true, false, true, true, true]));
  check("AF4 — through the flow itself (care homes): the intervening-owner question answered \"No\" hides itself, yet Back returns to it and a changed answer stands; walked forward again from before it, it is asked again",
    stubFlow("care_homes", [], A => {
      A.to("Q14iv", { Q1: "company", Q8: ["purchase"], Q8a: "property", Q9: 2000000, Q12: "unsure", Q14: "no" });
      A.answer("no"); const after = A.at(); const hidden = !A.Q.find(q => q.id === "Q14iv").showIf(A.S());
      A.back(); const backAt = A.at(); A.answer("yes"); const s1 = A.S().intervening_owner, next = A.at();
      const dflt = () => (q => q.opts ? (q.type === "multi" ? [q.opts[0][0]] : q.opts[0][0]) : q.type === "date" ? "2020-01-01" : 1000)(A.Q.find(q => q.id === A.at()));
      A.back(); A.answer("no"); A.back(); A.back(); const before = A.at(); A.answer(dflt());
      let asked = false; for (let n = 0; n < 12 && !asked && A.stage().indexOf('id="next"') >= 0; n++) { if (A.at() === "Q14iv") asked = true; else A.answer(dflt()); }
      return [after !== "Q14iv", hidden, backAt, s1, next !== "Q14iv", before !== "Q14iv", asked]; }),
    [true, true, "Q14iv", "yes", true, true, true]);
  check("AF4 — the renderer of every flow steps Back over hidden questions, still returns to one hidden only by its own answer, and walks forward onto that one every pass",
    SECS.map(sec => { const a = engineBody.indexOf("/* ===== " + sec + " ===== */"); const b = engineBody.indexOf('RS["' + sec + '"]=', a);
      const part = engineBody.slice(engineBody.indexOf("//  RENDERER", a), b);
      return [/function askable\(i\)\{[^]*?visible\(q\)[^]*?shownWithoutOwn\(S, q\.showIf\)/.test(part),
              part.indexOf('document.getElementById("back").onclick=()=>{ while(history.length){ const i=history.pop(); if(askable(i)){') >= 0,
              part.indexOf('document.getElementById("back").disabled=!history.some(askable);') >= 0,
              part.indexOf('function nextIndex(from){ let i=from; while(i<Q.length && !askable(i)) i++; return i; }') >= 0]; }),
    SECS.map(() => [true, true, true, true]));
}


/* =============================================================================
   SUITE AG - PHASE 132j, 16 September 2026. The polluter question in the four
   other flows (item 13062147385).

   Phase 132i made the private hospital flow's land remediation panel need a
   KNOWN "no" to H23. Care homes, dental, supported living and GP asked x10c
   (derelict or contaminated land) and set lrr on "yes", and nothing asked who
   caused it - so the answer was always ABSENT and the panel always showed.
   Each of the four now has x23 straight after x10c, built as H23: "yes" takes
   the line away and says why, "Not sure" is flagged, lrrFromAnswers works out
   lrr, the marker and the line from both current answers in any order, and the
   result's lrr needs a known "no". No figure reads lrr.

     AG0  x23 exists straight after x10c, asked only once x10c has said "yes";
          every flow wraps its questions with lrrFromAnswers.
     AG1  N4, both forms, per flow, switches off and on: after a known x10c
          "yes", the panel (the result's lrr) shows only on a KNOWN "no";
          "Not sure", undefined, null and never answered leave it off, while x23
          is still asked; only "Not sure" raises the polluter flag.
     AG2  and no figure moves with the x23 answer.
     AG3  the AE9 order grid per flow: every order and combination, with and
          without the flow's hidden take-back, two starting sessions.
     AG4  N4 on x10c: "Not sure", cleared or never answered never turns lrr on.
     AG5  x10c "yes", x23 "yes", then x10c "no": everything taken back.
     AG6  through the flow itself, all four: x10c "yes" asks x23; Back to x10c,
          "no", Continue - x23 is not asked again and nothing it set remains.
   ============================================================================= */
if (startSuite("AG", "Phase 132j — the polluter question in care homes, dental, supported living and GP")) {
  const safe = fn => { try { return fn(); } catch (e) { return "threw: " + e.message; } };
  const FOUR = [["care_homes", "Q"], ["dental", "D"], ["supported_living", "S"], ["gp", "G"]];
  const ALL_GATES = (layerSrc.slice(layerSrc.indexOf("var CB_CTA"), layerSrc.indexOf("};", layerSrc.indexOf("var CB_CTA")))
    .match(/^\s*([a-z0-9_]+)\s*:\s*false/gm) || []).map(x => x.replace(/:.*$/, "").trim());
  const MODS = {}; const mod = (sec, on) => (MODS[sec + on] = MODS[sec + on] || liftGated(sec, on ? ALL_GATES : []));
  const qOf = (sec, id, on) => (mod(sec, on).Q || []).find(q => q.id === id);
  const J = x => JSON.stringify(x, (k, v) => v === undefined ? "__undefined__" : v);
  const FIG = ["QE", "TS", "cash", "cashRoute", "cashBlocked", "cashGates", "pool", "speed", "grant", "sipp"];
  const LRR_MSG = "The extra relief for land remediation is only available where the contamination was someone else’s. That doesn’t affect the rest of the assessment.";
  const POLLUTER_FLAG = "Confirm polluter status — land remediation relief is only for contamination or dereliction someone else caused.";
  const fresh = () => ({ trigger: [], flags: [], assumptions: [], lrr: false });

  check("AG0 — all four: x23 is the question straight after x10c, shows only once x10c has said \"yes\", and the flow wraps its questions with lrrFromAnswers",
    FOUR.map(([sec, p]) => safe(() => { const Q = mod(sec, false).Q, i = Q.findIndex(q => q.id === p + "10c"), q23 = qOf(sec, p + "23", false);
      const s = Object.assign(fresh(), { claimant_type: "company", trigger: ["purchase"] }); const before = !!q23.showIf(s);
      qOf(sec, p + "10c", false).onSet(s, "yes");
      const a = engineBody.indexOf("/* ===== " + sec + " ===== */"), b = engineBody.indexOf('RS["' + sec + '"]=', a);
      return [Q[i + 1] && Q[i + 1].id, before, !!q23.showIf(s), engineBody.slice(a, b).indexOf("answerTakesBack(Q, null, lrrFromAnswers);") >= 0]; })),
    FOUR.map(([sec, p]) => [p + "23", false, true, true]));

  const base = sec => ({ sector: sec, trigger: ["purchase", "refurb"], deal: "property", base_amount: 2000000, claimant_type: "company", claimant_raw: "company",
    activity: "trade", dwelling_setting: "institution_commercial", acuity: "normal", plant_serves: "individual", flags: [], assumptions: [], lrr: false,
    return_in_time: false, nation: "england" });
  const runOf = (sec, p, on, v) => safe(() => { const s = base(sec), E = mod(sec, on);
    qOf(sec, p + "10c", on).onSet(s, "yes"); if (v !== "unanswered") qOf(sec, p + "23", on).onSet(s, v);
    const r = E.runEngine(s);
    return { lrr: r.lrr, asks: !!qOf(sec, p + "23", on).showIf(s), flag: (r.flags || []).indexOf(POLLUTER_FLAG) >= 0, fig: J(FIG.map(k => r[k])) }; });
  const X23 = ["no", "yes", "unsure", undefined, null, "unanswered"];
  check("AG1 — N4, both forms, all four flows, switches off and on: after a known x10c \"yes\" the land remediation panel shows only on a KNOWN \"no\"; \"Not sure\", cleared (undefined, null) and never answered leave it off; x23 stays asked on every answer, as H23 does (a known \"yes\" keeps it on screen through the marker); only \"Not sure\" raises the polluter flag",
    [false, true].map(on => FOUR.map(([sec, p]) => X23.map(v => { const x = runOf(sec, p, on, v); return typeof x === "string" ? x : [x.lrr, x.asks, x.flag]; }))),
    [false, true].map(() => FOUR.map(() => [[true, true, false], [false, true, false], [false, true, true], [false, true, false], [false, true, false], [false, true, false]])));
  check("AG2 — no figure moves with the x23 answer: every answer gives the figures of a known \"no\", all four, switches off and on",
    [false, true].map(on => FOUR.map(([sec, p]) => X23.map(v => { const x = runOf(sec, p, on, v), n = runOf(sec, p, on, "no");
      return typeof x !== "string" && x.fig === n.fig && x.fig.indexOf("threw") === -1; }))),
    [false, true].map(() => FOUR.map(() => X23.map(() => true))));

  const VALS = ["yes", "no", "unsure", undefined, null];
  const lrrState = s => [!!s.lrr, s.lrr_removed_by_polluter === true, s.assumptions.filter(x => x === LRR_MSG).length];
  check("AG3 — the AE9 grid in all four: every order and every combination (yes, no, \"Not sure\", undefined, null), with and without the flow's hidden take-back, two starting sessions - lrr on exactly when x10c is a KNOWN \"yes\" and x23 is not a KNOWN \"yes\"; the marker and line exactly when both are \"yes\"",
    FOUR.map(([sec, p]) => safe(() => { const out = [], M = mod(sec, false), Q = id => qOf(sec, id, false), D = p + "10c", P = p + "23";
      const orders = [
        (x, y) => [[D, x], [P, y]], (x, y) => [[P, y], [D, x]],
        (x, y) => [[D, "yes"], [P, y], [D, x]], (x, y) => [[D, x], [P, "yes"], [P, y]],
        (x, y) => [[P, "yes"], [D, "yes"], [D, x], [P, y]], (x, y) => [[D, "no"], [P, "no"], [D, x], [P, y]] ];
      [() => Object.assign(fresh(), { claimant_type: "company", trigger: ["purchase"] }), () => ({ claimant_type: "company", trigger: ["purchase"], flags: [], assumptions: [] })].forEach((b, bi) =>
        [false, true].forEach(flow => orders.forEach((o, oi) => VALS.forEach(x => VALS.forEach(y => {
          const s = b(); o(x, y).forEach(([id, v]) => { Q(id).onSet(s, v); if (flow) M.hide(M.Q, s, Q(id)); });
          const want = [x === "yes" && y !== "yes", x === "yes" && y === "yes", x === "yes" && y === "yes" ? 1 : 0];
          if (J(lrrState(s)) !== J(want) && out.length < 4) out.push("base" + bi + (flow ? " flow" : "") + " order" + oi + " " + D + "=" + J(x) + " " + P + "=" + J(y) + " got " + J(lrrState(s))); })))));
      return out; })),
    FOUR.map(() => []));
  check("AG4 — N4 on x10c, all four: with x10c \"Not sure\", cleared or never answered, lrr is never turned on, whatever x23 says or in what order",
    FOUR.map(([sec, p]) => safe(() => ["unsure", undefined, null, "unanswered"].map(x => VALS.concat(["unanswered"]).map(y => [0, 1].map(o => {
      const s = Object.assign(fresh(), { claimant_type: "company", trigger: ["purchase"] });
      const seq = [[p + "10c", x], [p + "23", y]].filter(q => q[1] !== "unanswered"); (o ? seq.reverse() : seq).forEach(([id, v]) => qOf(sec, id, false).onSet(s, v));
      return !!s.lrr; }))).flat(2).some(Boolean))),
    FOUR.map(() => false));
  check("AG5 — all four: x10c \"yes\", x23 \"yes\", then x10c \"no\" - lrr false, no marker, no line, x23 hidden and taken back by the flow; x23 then answered \"no\" does not bring lrr back",
    FOUR.map(([sec, p]) => safe(() => { const M = mod(sec, false), Q = id => qOf(sec, id, false), s = Object.assign(fresh(), { claimant_type: "company", trigger: ["purchase"] });
      Q(p + "10c").onSet(s, "yes"); M.hide(M.Q, s, Q(p + "10c")); Q(p + "23").onSet(s, "yes"); M.hide(M.Q, s, Q(p + "23"));
      Q(p + "10c").onSet(s, "no"); const taken = M.hide(M.Q, s, Q(p + "10c"));
      const a = [lrrState(s), Q(p + "23").showIf(s), taken, "lrr_polluter" in s];
      Q(p + "23").onSet(s, "no"); return a.concat([s.lrr]); })),
    FOUR.map(([sec, p]) => [[false, false, 0], false, [p + "23"], false, false]));

  const PICK = { care_homes: { Q1: "company", Q8: ["purchase", "refurb"] }, dental: { D1: "company", D8: ["purchase", "refurb"] },
    supported_living: { S1: "company", S4: "care", S6: "supported", S6a: "shared", S6b: ["circulation"], S8: ["purchase"] }, gp: { G1: "company", G8: ["purchase", "refurb"] } };
  check("AG6 — through the flow itself, all four: x10c \"yes\" asks x23; x23 \"yes\"; Back to x10c, \"no\", Continue - lrr stays off, the polluter answer, marker and line are gone, and x23 is not asked again",
    FOUR.map(([sec, p]) => stubFlow(sec, [], A => {
      A.to(p + "10c", PICK[sec]); A.answer("yes"); const lrrOn = A.S().lrr; const at23 = A.at(); A.answer("yes");
      A.back(); A.back(); const backAt = A.at(); A.answer("no"); const s = A.S();
      return [lrrOn, at23, backAt, A.at() !== p + "23", s.lrr, "lrr_removed_by_polluter" in s, "lrr_polluter" in s, s.assumptions.indexOf(LRR_MSG)]; })),
    FOUR.map(([sec, p]) => [true, p + "23", p + "10c", true, false, false, false, -1]));
}


/* =============================================================================
   SUITE AH — PHASE 151b. VAT in the £1,000 no-claim test. Word question 61.

   DECIDED by Lakhbir Dhillon, question 61 closed 24 September 2026: "The relief
   is calculated over the 5 years – and must include VAT". Closed as: measure
   the relief over five years, and include VAT where the client cannot reclaim
   it. The tax adviser reviews the wording.

   WHAT THIS SUITE PROVES, AND IT IS FIVE THINGS.
     VT1  We are NOT VAT-registered, as shipped: the test is exactly what it was
          before, whatever the client's VAT position - no VAT exists to count.
     VT2  Registered, and the client CANNOT reclaim: VAT is counted, and on a
          worked example it moves the verdict across the £1,000 line
          (£30,000 of special-rate allowances, a company at 25%: £1,995.72 of
          five-year relief; £900 fee leaves £1,095.72, at or above; £900 plus
          £180 VAT leaves £915.72, below).
     VT3  Registered, and the client CAN reclaim: VAT is not counted.
     VT4  Registered, and the client's position NOT KNOWN - "not sure" AND
          never given (and null, "unsure", "mixed") - is UNDETERMINED with a
          plain reason: never "do not claim", never a pass, and the forms give
          identical reports (N4). A registered flag with no rate is the same.
     VT5  Nothing else moves, five years is still the measure, and the new
          wording is marked for the tax adviser.

   REGISTRATION IS SWITCHED ON ONLY INSIDE withVat(), which puts the shipped
   values back in `finally` - the mutate-and-restore NCT6 uses for the gate.
   Written so that against a site with no VAT handling every new check FAILS
   rather than the harness dying.
   ============================================================================= */
if (startSuite("AH", "Phase 151b — VAT in the £1,000 no-claim test")) {
  const safe = fn => { try { return fn(); } catch (e) { return "threw: " + e.message; } };
  const NC = r => (r && r.recommendation_threshold) || {};
  const gbp = n => (n < 0 ? "-" : "") + "£" + Math.round(Math.abs(n)).toLocaleString("en-GB");
  const J = JSON.stringify;
  const r2 = n => (typeof n === "number") ? Math.round(n * 100) / 100 : n;
  const V = () => CB_FEE.NO_CLAIM_VAT;
  const withVat = (registered, rate, fn) => {
    const v = V();
    if (!v || typeof v !== "object") return "no CB_FEE.NO_CLAIM_VAT";
    const keep = { we_are_vat_registered: v.we_are_vat_registered, vat_rate: v.vat_rate };
    try { v.we_are_vat_registered = registered; v.vat_rate = rate; return fn(); }
    catch (e) { return "threw: " + e.message; }
    finally { v.we_are_vat_registered = keep.we_are_vat_registered; v.vat_rate = keep.vat_rate; }
  };
  const SP = a => ({ main: 0, special: a, period_start: "2026-04-01", is_company: true });
  const at = (a, clientVat, omitKey) => {
    const ctx = SP(a); if (!omitKey) ctx.client_vat = clientVat;
    return CB_FEE.display(a, 0.25, ctx);
  };
  const facts = t => [t.outcome, t.fires, r2(t.fee), r2(t.fee_counted), r2(t.relief_after_fee)];
  const UNKNOWN = [["\"not sure\"", "not sure", false], ["never given (no key)", undefined, true],
                   ["undefined", undefined, false], ["null", null, false], ["\"unsure\"", "unsure", false], ["\"mixed\"", "mixed", false]];

  /* --- VT1: not registered, as shipped: unchanged from today -------------- */
  check("VT1 — the setting ships NOT registered, with the rate as data (20%), decided under question 61",
    safe(() => [V().we_are_vat_registered, V().vat_rate, V().question, V().decided_by]),
    [false, 0.2, 61, "Lakhbir Dhillon"]);
  /* The report records the position it was given (vat.client_vat_position);
     everything else in it must be the same as with no position at all. */
  const noPos = t => { const c = Object.assign({}, t); c.vat = Object.assign({}, t.vat); delete c.vat.client_vat_position; return J(c); };
  check("VT1 — not registered: every client VAT position gives the same test as no position at all, for a case that fires and one that does not, and each report says no VAT was counted because we are not registered",
    safe(() => [20000, 30000].map(a => {
      const base = noPos(NC(at(a, undefined, true)));
      return ["cannot_reclaim", "can_reclaim", "not sure", null].map(x => noPos(NC(at(a, x))) === base &&
        NC(at(a, x)).vat.treatment === "NOT_REGISTERED_NO_VAT" && NC(at(a, x)).fee_counted === NC(at(a, x)).fee); })),
    [[true, true, true, true], [true, true, true, true]]);
  check("VT1 — not registered: £30,000 counts the £900 fee alone and stays at or above £1,000 (£1,095.72), even for a client who cannot reclaim VAT",
    safe(() => { const t = NC(at(30000, "cannot_reclaim")); return facts(t).concat([t.vat && t.vat.treatment, t.vat && t.vat.vat]); }),
    ["AT_OR_ABOVE_THRESHOLD", false, 900, 900, 1095.72, "NOT_REGISTERED_NO_VAT", 0]);
  check("VT1 — not registered: the £20,000 message is word for word the Phase 132e sentence, with no mention of VAT, and the report says why",
    safe(() => { const t = NC(at(20000, "cannot_reclaim"));
      return t.message === "On these figures the tax relief to you over the first 5 years is about " + gbp(t.relief) +
        ", our fee is £600, and the relief left after our fee is " + gbp(t.relief_after_fee) + ". That is below £1,000, so we would " +
        "not normally recommend making this claim. The choice is yours: we will still do the work if you want to go ahead."
        && !/VAT/.test(t.message) && t.vat.treatment === "NOT_REGISTERED_NO_VAT"; }),
    true);

  /* --- VT2: registered + cannot reclaim: VAT counted, verdict flips -------- */
  check("VT2 — registered, client cannot reclaim: £30,000 — fee £900 plus VAT £180 is £1,080 counted; relief after it £915.72, BELOW £1,000, so it fires",
    withVat(true, 0.20, () => { const t = NC(at(30000, "cannot_reclaim"));
      return facts(t).concat([t.vat.treatment, t.vat.vat, r2(t.relief)]); }),
    ["BELOW_THRESHOLD", true, 900, 1080, 915.72, "COUNTED_CLIENT_CANNOT_RECLAIM", 180, 1995.72]);
  check("VT2 — the worked example flips across the line: the same case not registered is AT OR ABOVE, registered and not reclaimable is BELOW",
    [safe(() => NC(at(30000, "cannot_reclaim")).outcome), withVat(true, 0.20, () => NC(at(30000, "cannot_reclaim")).outcome)],
    ["AT_OR_ABOVE_THRESHOLD", "BELOW_THRESHOLD"]);
  check("VT2 — the message states the fee, the VAT and the total, and the relief left after both",
    withVat(true, 0.20, () => { const m = NC(at(30000, "cannot_reclaim")).message || "";
      return [m.indexOf("our fee is £900 plus VAT of £180, which you cannot reclaim, so £1,080 in all") >= 0,
              m.indexOf("the relief left after our fee and its VAT is £916") >= 0, /The choice is yours/.test(m)]; }),
    [true, true, true]);
  check("VT2 — fee x (1 + rate), to the penny, read from the rate as data (a 5% rate counts £45 on £900)",
    withVat(true, 0.05, () => { const t = NC(at(30000, "cannot_reclaim")); return [t.vat.vat, r2(t.fee_counted), t.outcome]; }),
    [45, 945, "AT_OR_ABOVE_THRESHOLD"]);

  /* --- VT3: registered + can reclaim: not counted -------------------------- */
  check("VT3 — registered, client CAN reclaim: £30,000 counts the £900 fee alone and stays at or above (£1,095.72)",
    withVat(true, 0.20, () => { const t = NC(at(30000, "can_reclaim")); return facts(t).concat([t.vat.treatment, t.vat.vat]); }),
    ["AT_OR_ABOVE_THRESHOLD", false, 900, 900, 1095.72, "NOT_COUNTED_CLIENT_CAN_RECLAIM", 0]);
  check("VT3 — registered, client can reclaim, £20,000: the relief after fee is the fee-only figure, and the message says the VAT is reclaimable and not counted",
    withVat(true, 0.20, () => { const t = NC(at(20000, "can_reclaim"));
      return [t.outcome, r2(t.fee_counted), r2(t.relief_after_fee), /£600 plus VAT, which you can reclaim and so is not counted here/.test(t.message || "")]; }),
    ["BELOW_THRESHOLD", 600, 730.48, true]);

  /* --- VT4: registered + not known: UNDETERMINED, never "do not claim" (N4) - */
  check("VT4 — registered, client's VAT position not known: \"not sure\", never given, undefined, null, \"unsure\" and \"mixed\" are all UNDETERMINED on a case that would fire (£20,000) and on one that would pass (£30,000)",
    withVat(true, 0.20, () => [20000, 30000].map(a => UNKNOWN.map(([, x, omit]) => NC(at(a, x, omit)).outcome))),
    [UNKNOWN.map(() => "UNDETERMINED"), UNKNOWN.map(() => "UNDETERMINED")]);
  check("VT4 — and none of them fires, prints a message, or is read as a figure: fires false, message null, fee counted and relief after fee null",
    withVat(true, 0.20, () => [20000, 30000].map(a => UNKNOWN.map(([, x, omit]) => { const t = NC(at(a, x, omit));
      return [t.fires, t.message, t.fee_counted, t.relief_after_fee, t.vat.client_vat_position, t.vat.vat]; }))),
    [0, 1].map(() => UNKNOWN.map(() => [false, null, null, null, "not_known", null])));
  check("VT4 — \"not sure\" and never given give IDENTICAL reports, field by field, and so does every other unknown form",
    withVat(true, 0.20, () => [20000, 30000].map(a => { const base = J(NC(at(a, "not sure")));
      return UNKNOWN.map(([, x, omit]) => J(NC(at(a, x, omit))) === base); })),
    [UNKNOWN.map(() => true), UNKNOWN.map(() => true)]);
  check("VT4 — the reason is plain: we do not know whether the client can reclaim VAT on our fee, and we do not tell them not to claim",
    withVat(true, 0.20, () => { const w = NC(at(20000, "not sure")).why || "";
      return [/do not know whether you can reclaim the VAT on our fee/.test(w), /we do not tell you not to claim/.test(w), /CB_/.test(w)]; }),
    [true, true, false]);
  check("VT4 — a registered flag with no usable VAT rate is not a rate of nil: UNDETERMINED, even for a client who cannot reclaim",
    [withVat(true, null, () => { const t = NC(at(30000, "cannot_reclaim")); return [t.outcome, t.fires, t.fee_counted, /no VAT rate is set/.test(t.why || "")]; }),
     withVat(true, "not sure", () => NC(at(30000, "cannot_reclaim")).outcome)],
    [["UNDETERMINED", false, null, true], "UNDETERMINED"]);
  check("VT4 — the unknowns still behave as before this phase where the relief or the fee is itself unknown (the older reason wins)",
    withVat(true, 0.20, () => [/no fee for this case yet/.test(NC(CB_FEE.display(null, 0.25, { client_vat: "not sure" })).why || ""),
      /tax relief for this case is not known exactly/.test(NC(CB_FEE.display(20000, "not sure", Object.assign(SP(20000), { client_vat: "not sure" }))).why || "")]),
    [true, true]);

  /* --- VT5: nothing else moves; five years; marked for the adviser -------- */
  check("VT5 — registered and counting VAT moves no figure: render, amount, reason, readings and the benefit comparison are those of the unregistered call",
    (function(){
      const plain = safe(() => at(30000, "cannot_reclaim"));
      const vat = withVat(true, 0.20, () => at(30000, "cannot_reclaim"));
      const strip = o => { if (!o || typeof o !== "object") return String(o); const c = Object.assign({}, o); delete c.recommendation_threshold; return J(c); };
      return [strip(vat) === strip(plain), vat && vat.amount, vat && vat.render, NC(vat).refuses_work, NC(vat).withholds_quote, NC(vat).moves_figure];
    })(),
    [true, 900, true, false, false, false]);
  check("VT5 — five years was already the measure and still is: the relief is CB_BENEFIT's five-year cumulative relief, with or without VAT",
    [CB_BENEFIT.HORIZON, safe(() => NC(at(30000, "cannot_reclaim")).horizon_years),
     withVat(true, 0.20, () => { const t = NC(at(30000, "cannot_reclaim")); return [t.horizon_years, t.relief_basis]; })],
    [5, 5, [5, "cumulative_benefit"]]);
  check("VT5 — the direct call takes the client's VAT position as its fourth argument, and three arguments are unchanged",
    [withVat(true, 0.20, () => CB_FEE.recommendationThreshold(900, { computed: true, determined: true, cumulative_benefit: 1995.72, horizon_years: 5 }, false, "cannot_reclaim").outcome),
     withVat(true, 0.20, () => CB_FEE.recommendationThreshold(900, { computed: true, determined: true, cumulative_benefit: 1995.72, horizon_years: 5 }, false).outcome),
     safe(() => CB_FEE.recommendationThreshold(900, { computed: true, determined: true, cumulative_benefit: 1995.72, horizon_years: 5 }).outcome)],
    ["BELOW_THRESHOLD", "UNDETERMINED", "AT_OR_ABOVE_THRESHOLD"]);
  check("VT5 — the VAT wording is marked for the tax adviser, in the metadata and in the code comment",
    [safe(() => V().awaiting_tax_adviser_review), safe(() => NC(at(30000, "cannot_reclaim")).vat.awaiting_tax_adviser_review),
     (function(){ const s = src.slice(src.indexOf("var CB_FEE"), src.indexOf("var CB_FEEGUARD")); const i = s.indexOf("VAT IN THE NO-CLAIM TEST");
       return i >= 0 && /AWAITING THE TAX ADVISER'S REVIEW/.test(s.slice(i)) && /NEW CLIENT-FACING WORDING, AWAITING THE TAX ADVISER'S REVIEW/.test(s.slice(i)); })()],
    [true, true, true]);
}


/* =============================================================================
   SUITE AI — PHASE 153b, 4 October 2026. Tax readings built on our own
   recommendation from the 29 September question review, for the accountant (or
   a tax adviser they name) to check. Lakhbir, 29 September 2026: "anything you
   need signing off we build it, we then ask the accountant/solicitor/DPO to see
   if its viable and if not we then correct it".

     AI1  Word question 73  - E-8 reads who the seller was; the extra question is gone
     AI2  Word question 77  - the care provider's lease and letter, with E-4 on only
     AI3  Word question 86  - a landlord payment for the shared parts comes off them
     AI4  Word question 92  - "repayment of tax paid for last year"
     AI5  Word question 95  - EL-U1, an election with no tax references
     AI6  Word question 96  - EL-W1, an election under the wrong label
     AI7  Word question 98  - EL-C2, an elected figure above the lawful maximum
     AI8  Word question 108 - SL-R34, a housing association's payment
     AI9  Word question 111 - the dental help text
     AI10 Word question 59  - VAT in the fee comparison, dormant until registered
     AI11 Word question 226 - the works-VAT answer and VAT on our fee

   Every new switch ships off (H11). Each reading is asserted both ways, and
   wherever a reading relieves, "not sure" AND absent are both asserted (N4).
   Written so that against the pre-change site every new check FAILS rather
   than the harness dying.
   ============================================================================= */
if (startSuite("AI", "Phase 153b — tax readings built on our recommendation")) {
  const safe = fn => { try { return fn(); } catch (e) { return "threw: " + e.message; } };
  const J = JSON.stringify;
  const near = (a, b) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 0.5;
  const base = (sector, extra) => Object.assign({
    sector: sector, trigger: ["purchase"], deal: "property", base_amount: 2000000, claimant_type: "company",
    activity: "trade", dwelling_setting: "institution_commercial", acuity: "normal",
    flags: [], assumptions: [], lrr: false, return_in_time: false }, extra || {});
  const runOn = (sector, gates, extra) => { const s = base(sector, extra); return { r: liftGated(sector, gates).runEngine(s), s }; };
  const hi = r => r && r.QE ? r.QE[1] : NaN;
  const lo = r => r && r.QE ? r.QE[0] : NaN;
  const layerOn = gates => { let l = layerSrc;
    (gates || []).forEach(g => { l = l.replace(new RegExp("(" + g + "\\s*:\\s*)false", "g"), "$1true"); });
    return new Function(l + "; return {CB_ELECTION:CB_ELECTION, CB_CTA:CB_CTA, CB_FEE:CB_FEE, CB_FEEGUARD:CB_FEEGUARD, CB_BENEFIT:CB_BENEFIT};")(); };
  const qOf = (sector, gates, id) => (liftGated(sector, gates).Q || []).find(q => q.id === id);
  const PFX = { care_homes: "Q", dental: "D", supported_living: "S", gp: "G", private_hospital: "H" };

  /* --- AI1: Word question 73 ------------------------------------------- */
  const E8 = ["s187a_needs_entitled_owner"];
  check("AI1 — the extra seller question is gone from all five flows, switch on and off (Lakhbir: \"Do not ask anything, Just find out who they purchased the property off\")",
    [E8, []].map(g => SECTORS.map(sec => !!qOf(sec, g, PFX[sec] + "51barred"))), [E8, []].map(() => SECTORS.map(() => false)));
  const seller = (sec, g, v) => safe(() => { const st = base(sec, { flags: [], assumptions: [] }); delete st.prior_owner_entitled;
    const M = liftGated(sec, g); const q = (M.Q || []).find(x => x.id === PFX[sec] + "12"); q.onSet(st, v); return st; });
  const e8flag = st => !!(st && st.flags && st.flags.some(f => /SELLER ARGUABLY NEVER ENTITLED \(E-8\)/.test(f)));
  check("AI1 — on, the seller answer \"A private landlord who let it out as homes\" records the bar and raises the E-8 evidence flag, in all five flows",
    SECTORS.map(sec => { const st = seller(sec, E8, "residential_landlord"); return [st.prior_owner_s35_barred, e8flag(st)]; }),
    SECTORS.map(() => [true, true]));
  check("AI1 — off, the same answer records the bar as it always did and raises no E-8 flag",
    SECTORS.map(sec => { const st = seller(sec, [], "residential_landlord"); return [st.prior_owner_s35_barred, e8flag(st)]; }),
    SECTORS.map(() => [true, false]));
  check("AI1 N4 — on, \"Not sure\" and no answer leave the bar unset and raise nothing (both asserted); so does a tax-paying seller",
    SECTORS.map(sec => [seller(sec, E8, "unsure"), seller(sec, E8, undefined), seller(sec, E8, "taxpaying")]
      .map(st => ["prior_owner_s35_barred" in st, e8flag(st)])),
    SECTORS.map(() => [[false, false], [false, false], [false, false]]));
  check("AI1 — on, a landlord seller with no earlier entitled owner takes the purchase outside s.187A from the seller answer alone",
    safe(() => { const st = seller("supported_living", E8, "residential_landlord");
      Object.assign(st, { prior_owner_claimed: "yes", earlier_entitled_owner: "no", election_document: "exists_not_held", election_value: 50000 });
      const r = liftGated("supported_living", E8).runEngine(st); return [typeof st.election_outcome, r.flags.some(f => /s\.187A NOT ENGAGED/.test(f))]; }),
    ["undefined", true]);

  /* --- AI2: Word question 77 ------------------------------------------- */
  const docsSrc = (function(){ const i = src.indexOf("function DOCS(sector, trigger){"); if (i < 0) return null;
    const j = src.indexOf("\nfunction ", i + 10); return src.slice(i, j < 0 ? undefined : j); })();
  const docs = (on, sector) => safe(() => new Function("CB_CTA", docsSrc + "; return DOCS(" + J(sector) + ", [\"purchase\"]);")({ specialised_supported_housing: on }));
  const careDocs = h => typeof h === "string" ? [/Lease or contract with the care provider/.test(h), /Letter from the care provider confirming the care given on site/.test(h)] : h;
  check("AI2 — with E-4 on, supported living's document list asks for the care provider's lease or contract and its confirming letter",
    careDocs(docs(true, "supported_living")), [true, true]);
  check("AI2 — off, and in every other sector either way, the list is as it was",
    [careDocs(docs(false, "supported_living"))].concat(["care_homes", "dental", "gp", "private_hospital"].map(sec => careDocs(docs(true, sec)))),
    [[false, false], [false, false], [false, false], [false, false], [false, false]]);

  /* --- AI3: Word question 86 ------------------------------------------- */
  {
    const SLC = ["sl_landlord_contribution"];
    const SL = extra => Object.assign({ trigger: ["refurb_fitout"], base_amount: 400000, landlord_contrib_answer: "yes", landlord_contrib_fraction: 0.3 }, extra);
    const spread = runOn("supported_living", SLC, SL()).r;
    const tied = runOn("supported_living", SLC, SL({ landlord_contrib_shared_parts: true })).r;
    const none = runOn("supported_living", SLC, SL({ landlord_contrib_answer: "no", landlord_contrib_fraction: 0 })).r;
    /* worked example from the review: £400,000, landlord 30%, shared parts 25%. Spread first: £400,000 x 70% x 25%
       = £70,000 of shared parts. Tied to the shared parts: £100,000 - £120,000 = nil. */
    check("AI3 — on, a payment KNOWN to be for the shared parts comes straight off them: the review's example (£400,000, 30%, shared parts 25%) leaves nothing, where spreading it leaves 70% of the figure",
      [near(hi(spread), hi(none) * 0.7), hi(tied), tied.flags.some(f => /LANDLORD PAYMENT TAKEN OFF THE SHARED PARTS/.test(f))],
      [true, 0, true]);
    const small = runOn("supported_living", SLC, SL({ landlord_contrib_fraction: 0.1, landlord_contrib_shared_parts: true })).r;
    check("AI3 — a smaller tied payment (10%) takes £40,000 off the £100,000 of shared parts: 60% of the untouched figure, below the 90% an even spread gives",
      near(hi(small), hi(none) * 0.6), true);
    const qp = qOf("supported_living", SLC, "S51slcp");
    const ask = v => { const st = base("supported_living", SL()); if (qp) qp.onSet(st, v); return st; };
    const u = ask("unsure"), n = ask("no"), absent = base("supported_living", SL());
    const ru = liftGated("supported_living", SLC).runEngine(u), rn = liftGated("supported_living", SLC).runEngine(n), ra = liftGated("supported_living", SLC).runEngine(absent);
    check("AI3 N4 — \"no\", \"not sure\" and no answer all keep the even spread (each asserted); only \"not sure\" is flagged",
      [near(hi(rn), hi(spread)), near(hi(ru), hi(spread)), near(hi(ra), hi(spread)),
       ru.flags.some(f => /Word question 86/.test(f)), ra.flags.some(f => /Word question 86/.test(f))],
      [true, true, true, true, false]);
    check("AI3 — the question is asked only with the switch on and only after a landlord payment; off, a session saying it was tied is today's figure",
      [!!(qp && qp.showIf({ landlord_contrib_answer: "yes" })), !!(qp && qp.showIf({ landlord_contrib_answer: "no" })),
       !!qOf("supported_living", [], "S51slcp")?.showIf({ landlord_contrib_answer: "yes" }),
       near(hi(runOn("supported_living", [], SL({ landlord_contrib_shared_parts: true })).r), hi(runOn("supported_living", [], SL()).r))],
      [true, false, false, true]);
  }

  /* --- AI4: Word question 92 ------------------------------------------- */
  check("AI4 — the loss-carried-back sentence says \"repayment of tax paid for last year\" in all five flows, and \"come back as a refund\" nowhere",
    [(src.match(/part of this can also come back as a repayment of tax paid for last year\./g) || []).length, /come back as a refund/.test(src)],
    [5, false]);

  /* --- AI5-AI7: the elections ------------------------------------------- */
  const SIX = ["amount", "plant", "land", "interest", "utrs", "both"];
  const EL = (extra) => Object.assign({ trigger: ["purchase"], election_document: "held", election_content: SIX.slice(),
    election_value: 300000, election_scope: "all_fixtures", election_multi_property: "no", acquisition_date: "2015-01-01",
    election_notified_date: "2015-06-01", __section: () => ({ section: "s.198", item: 1, available: true, why: "a sale" }) }, extra);
  const closed = () => false, open = () => true, unknown = () => null;
  const assess = (gates, st) => safe(() => layerOn(gates).CB_ELECTION.assess(st));
  const out = (gates, st) => { const r = assess(gates, st); return r && r.outcome ? r.outcome : r; };
  const NOUTR = SIX.filter(k => k !== "utrs");
  const U1 = ["election_missing_utr_fixable"];
  check("AI5 — EL-U1 off: an election missing only its tax references is nil once the window has closed, remade inside it, unresolved where the window is not known (today)",
    [closed, open, unknown].map(w => out([], EL({ election_content: NOUTR, __windowOpen: w }))), ["NIL", "LIVE", "INDET"]);
  check("AI5 — EL-U1 on: once the window is KNOWN to have closed it stands at the elected figure and is flagged as a slip; inside the window and unknown, nothing changes (N4)",
    [closed, open, unknown].map(w => { const r = assess(U1, EL({ election_content: NOUTR, __windowOpen: w })); return [r.outcome, r.value === 300000 && r.outcome === "CAP-ELECT"]; }),
    [["CAP-ELECT", true], ["LIVE", false], ["INDET", false]]);
  check("AI5 — EL-U1 on: anything else missing as well still fails it, and a complete election is untouched",
    [out(U1, EL({ election_content: ["amount", "plant", "land", "both"], __windowOpen: closed })),
     J(assess(U1, EL({ __windowOpen: closed }))) === J(assess([], EL({ __windowOpen: closed })))], ["NIL", true]);
  check("AI5 — EL-U1 on: the engine says so in the assumptions and flags of the five flows",
    SECTORS.map(sec => safe(() => { const r = runOn(sec, U1, EL({ election_content: NOUTR, __windowOpen: closed, prior_owner_claimed: "yes", prior_owner_entitled: "yes" })).r;
      return r.flags.some(f => /ELECTION WITHOUT TAX REFERENCES TREATED AS VALID \(EL-U1\)/.test(f)); })), SECTORS.map(() => true));
  const W1 = ["election_wrong_section_accepted"];
  const WRONG = w => EL({ election_section: "s.199", __windowOpen: w });
  check("AI6 — EL-W1 off: a complete election under the wrong label is remade inside the window and unresolved outside it (today)",
    [closed, open, unknown].map(w => out([], WRONG(w))), ["INDET", "LIVE", "INDET"]);
  check("AI6 — EL-W1 on: once the window is KNOWN to have closed it is read under the right section at the elected figure; inside and unknown, nothing changes (N4)",
    [closed, open, unknown].map(w => { const r = assess(W1, WRONG(w)); return [r.outcome, r.outcome === "CAP-ELECT" ? r.section + " " + r.value : null]; }),
    [["CAP-ELECT", "s.198 300000"], ["LIVE", null], ["INDET", null]]);
  check("AI6 — EL-W1 on: the flows flag it as a switched position",
    SECTORS.map(sec => safe(() => runOn(sec, W1, Object.assign(WRONG(closed), { prior_owner_claimed: "yes", prior_owner_entitled: "yes" })).r.flags
      .some(f => /WRONGLY LABELLED ELECTION TREATED AS VALID \(EL-W1\)/.test(f)))), SECTORS.map(() => true));
  const C2 = ["election_value_cut_to_lawful_max"];
  const CUT = extra => EL(Object.assign({ __windowOpen: closed, base_amount: 2000000 }, extra));
  check("AI7 — EL-C2 off: the claim rests on the figure the election states, even above what the seller paid (today)",
    safe(() => assess([], CUT({ election_seller_cost: 250000 })).value), 300000);
  check("AI7 — EL-C2 on: the review's example (£300,000 elected, the seller paid £250,000) is cut down to £250,000; the document's figure is kept beside it",
    safe(() => { const r = assess(C2, CUT({ election_seller_cost: 250000 })); return [r.value, r.value_as_elected, r.cut.by.key]; }),
    [250000, 300000, "seller_cost"]);
  check("AI7 — EL-C2 on: the price paid is the other limit (bought for £200,000, seller's cost not known), and a figure under both limits is untouched",
    safe(() => [assess(C2, CUT({ base_amount: 200000 })).value, assess(C2, CUT({ election_seller_cost: 400000 })).value]), [200000, 300000]);
  check("AI7 N4 — EL-C2 on: a seller's cost not known (absent, or blank) cuts nothing and is never nil (both asserted)",
    safe(() => [assess(C2, CUT({})).value, assess(C2, CUT({ election_seller_cost: null })).value, assess(C2, CUT({ election_seller_cost: 0 })).value]),
    [300000, 300000, 300000]);
  check("AI7 — EL-C2 on: the flows tell the client and flag it; with the cost not known they flag it as not checked",
    SECTORS.map(sec => safe(() => { const a = runOn(sec, C2, CUT({ election_seller_cost: 250000, prior_owner_claimed: "yes", prior_owner_entitled: "yes" })).r;
      const b = runOn(sec, C2, CUT({ prior_owner_claimed: "yes", prior_owner_entitled: "yes", base_amount: 9000000 })).r;
      return [a.assumptions.some(x => /more than the law lets it fix/.test(x)), a.flags.some(f => /ELECTED VALUE CUT DOWN \(EL-C2\)/.test(f)),
              b.flags.some(f => /not checked against what the seller paid/.test(f))]; })), SECTORS.map(() => [true, true, true]));
  check("AI7 — the seller's-cost question is asked only with EL-C2 on, after the election amount, in all five flows",
    SECTORS.map(sec => { const on = liftGated(sec, C2).Q, at = id => on.findIndex(q => q.id === id), q = on[at(PFX[sec] + "51elcost")];
      const st = { election_document: "held", election_quantified: true };
      return [at(PFX[sec] + "51elcost") === at(PFX[sec] + "14v") + 1, !!(q && q.showIf(st)), !!qOf(sec, [], PFX[sec] + "51elcost")?.showIf(st)]; }),
    SECTORS.map(() => [true, true, false]));

  /* --- AI8: Word question 108 ------------------------------------------ */
  {
    const R34 = ["registered_provider_not_public_body"];
    const optsOf = g => (qOf("supported_living", g, "S17") || { opts: [] }).opts.map(o => o[0]);
    check("AI8 — the supported-living funding question offers a housing association or registered provider only with SL-R34 on",
      [optsOf([]).includes("registered_provider"), optsOf(R34).includes("registered_provider"), optsOf(R34).slice(-1)[0]], [false, true, "unsure"]);
    const st = () => base("supported_living", { trigger: ["refurb_fitout"], base_amount: 400000 });
    const M = liftGated("supported_living", R34), q = (M.Q || []).find(x => x.id === "S17");
    const rp = st(); q.onSet(rp, "registered_provider"); const rRP = M.runEngine(rp);
    const rNone = M.runEngine(st());
    const g = st(); q.onSet(g, "some"); g.grant_fraction = 0.2; const rG = M.runEngine(g);
    check("AI8 — on, a registered provider's payment stays in the claim (the no-grant figure, above a 20% grant's), and is flagged to check it got no tax relief",
      [near(hi(rRP), hi(rNone)), hi(rG) < hi(rRP), rRP.flags.some(f => /REGISTERED PROVIDER TREATED AS NOT A PUBLIC BODY \(SL-R34\)/.test(f))],
      [true, true, true]);
  }

  /* --- AI9: Word question 111 ------------------------------------------ */
  check("AI9 — the dental funding help says there is no general NHS premises grant scheme like the GP one, and no longer that there is none at all",
    [/no general NHS premises grant scheme like the GP one/.test(src), /dentistry has no NHS premises-grant scheme \(unlike GPs\)/.test(src)], [true, false]);

  /* --- AI10: Word question 59 ------------------------------------------ */
  {
    const L = layerOn([]);
    const V = L.CB_FEE.NO_CLAIM_VAT, G = L.CB_FEEGUARD;
    const withSet = (registered, sw, fn) => { const k = [V.we_are_vat_registered, G.fee_comparison_counts_vat];
      try { V.we_are_vat_registered = registered; G.fee_comparison_counts_vat = sw; return fn(); } catch (e) { return "threw: " + e.message; }
      finally { V.we_are_vat_registered = k[0]; G.fee_comparison_counts_vat = k[1]; } };
    const ctx = vat => { const c = { main: 0, special: 30000, period_start: "2026-04-01", is_company: true }; if (vat !== undefined) c.client_vat = vat; return c; };
    const C = (vat) => L.CB_FEE.display(30000, 0.25, ctx(vat)).comparison;
    check("AI10 — the switch ships off, beside the two fee-guard switches",
      [G.fee_comparison_counts_vat, G.fee_cap_at_year_one_benefit, G.fee_warn_when_exceeds_benefit], [false, false, false]);
    check("AI10 — not registered (today): the comparison is the same field for field, switch on or off, whatever the client's VAT position",
      ["cannot_reclaim", "can_reclaim", "not sure", undefined].map(v => withSet(false, true, () => J(C(v))) === J(C(v))), [true, true, true, true]);
    check("AI10 — registered with the switch OFF: the comparison is the fee alone, as today",
      withSet(true, false, () => J(C("cannot_reclaim"))) === J(C("cannot_reclaim")), true);
    const y1 = C().year_one_benefit;
    check("AI10 — registered, switch on, the client cannot reclaim: the fee counted is £900 plus £180 VAT, the fee stays £900, and the year-one verdict is taken on £1,080",
      withSet(true, true, () => { const c = C("cannot_reclaim"); return [c.fee, c.fee_counted, c.fee_vat.treatment, c.fee_exceeds_year_one_benefit === (1080 > y1)]; }),
      [900, 1080, "COUNTED_CLIENT_CANNOT_RECLAIM", true]);
    check("AI10 — registered, switch on, the client can reclaim: the fee alone",
      withSet(true, true, () => { const c = C("can_reclaim"); return [c.fee, c.fee_counted, c.fee_vat.treatment]; }), [900, 900, "NOT_COUNTED_CLIENT_CAN_RECLAIM"]);
    check("AI10 N4 — registered, switch on, the position \"not sure\" and never given (both asserted): no fee counted, and a verdict only where the fee with and without VAT agree",
      withSet(true, true, () => ["not sure", undefined].map(v => { const c = C(v), plain = withSet(false, false, () => C(v));
        return [c.fee_counted, c.fee_vat.treatment, c.fee_exceeds_year_one_benefit === null || c.fee_exceeds_year_one_benefit === plain.fee_exceeds_year_one_benefit]; })),
      [[null, "UNDETERMINED", true], [null, "UNDETERMINED", true]]);
  }

  /* --- AI11: Word question 226 ----------------------------------------- */
  {
    const L = layerOn([]);
    const m = st => safe(() => L.CB_FEE.clientVatFromWorks(st));
    check("AI11 — the mapping: \"Reclaimed in full\" is can reclaim and \"Not reclaimable (exempt)\" cannot, ONLY for the same business with nothing changed",
      [m({ works_vat: "reclaim", works_vat_same_business: true }), m({ works_vat: "exempt", works_vat_same_business: true })], ["can_reclaim", "cannot_reclaim"]);
    check("AI11 N4 — every other answer, and every case without the confirmation (\"no\", \"not sure\", absent), stays not known",
      [m({ works_vat: "mixed", works_vat_same_business: true }), m({ works_vat: "zero", works_vat_same_business: true }),
       m({ works_vat: "dispensing", works_vat_same_business: true }), m({ works_vat: "unsure", works_vat_same_business: true }),
       m({ works_vat: "reclaim", works_vat_same_business: false }), m({ works_vat: "exempt" }), m({ works_vat: "reclaim", works_vat_same_business: null }), m({}), m(null)],
      [null, null, null, null, null, null, null, null, null]);
    const vq = sec => (liftGated(sec, []).Q || []).find(q => /^Was VAT charged on the spend/.test(q.ask || ""));
    check("AI11 — the works-VAT question keeps its answer as works_vat in all five flows, and the confirmation follows it",
      SECTORS.map(sec => safe(() => { const Q = liftGated(sec, []).Q, q = Q.find(x => /^Was VAT charged on the spend/.test(x.ask || "")), st = base(sec);
        q.onSet(st, "exempt"); return [st.works_vat, Q.findIndex(x => x.id === PFX[sec] + "51vatfee") === Q.indexOf(q) + 1]; })),
      SECTORS.map(() => ["exempt", true]));
    check("AI11 — the confirmation is never shown while we are not VAT-registered (today)",
      SECTORS.map(sec => !!qOf(sec, Object.keys(layerOn([]).CB_CTA), PFX[sec] + "51vatfee")?.showIf({ works_vat: "exempt" })), SECTORS.map(() => false));
  }
}


if (startSuite("AJ", "Phase 153e — the surveyor's workbench: supported living's band by trigger (Word question 138)")) {
  const safe = fn => { try { return fn(); } catch (e) { return "threw: " + e.message; } };
  const SW = ["sl_band_by_trigger"];
  const base = extra => Object.assign({
    sector: "supported_living", trigger: ["purchase"], deal: "property", base_amount: 2000000, claimant_type: "company",
    activity: "trade", dwelling_setting: "institution_commercial", acuity: "normal",
    flags: [], assumptions: [], lrr: false, return_in_time: false }, extra || {});
  const hi = r => r && r.QE ? r.QE[1] : NaN;
  /* A test-only copy of the shared layer whose supported-living PURCHASE band is narrower (10% to 15%), so the switch
     has something to change. The shipped bands are identical, so on the real text the switch changes no figure. */
  const NARROW = l => l.replace(/supported_living:\s*\{\s*purchase:\[0\.10,0\.25\]/, "supported_living: { purchase:[0.10,0.15]");
  const withLayer = (fn, f) => { const keep = layerSrc; layerSrc = f(layerSrc); try { return fn(); } finally { layerSrc = keep; } };
  const band = gates => { let l = layerSrc; (gates || []).forEach(g => { l = l.replace(new RegExp("(" + g + "\\s*:\\s*)false", "g"), "$1true"); });
    return new Function(NARROW(l) + "; return CB_BAND;")(); };

  check("AJ1 — the switch ships off, in the site and in what the harness reads",
    [CB_BAND.SWITCHES && CB_BAND.SWITCHES.sl_band_by_trigger, /sl_band_by_trigger\s*:\s*false/.test(layerSrc)], [false, true]);
  check("AJ2 — on the real text the three supported-living bands are the same, so the switch changes no figure for any trigger",
    ["purchase", "new_build", "fitout", "conversion"].map(t => safe(() =>
      hi(liftGated("supported_living", SW).runEngine(base({ trigger: [t] }))) === hi(liftGated("supported_living", []).runEngine(base({ trigger: [t] }))))),
    [true, true, true, true]);
  const on = safe(() => band(SW)), off = safe(() => band([]));
  check("AJ3 — slBand reads the trigger's own band; several triggers take the LOWEST ceiling, never the one that relieves",
    safe(() => [on.slBand(["purchase"]), on.slBand("new_build"), on.slBand(["fitout"]), on.slBand(["purchase", "fitout"]), on.slBand(["fitout", "purchase"])]),
    [[0.10, 0.15], [0.10, 0.25], [0.10, 0.25], [0.10, 0.15], [0.10, 0.15]]);
  check("AJ4 N4 — no trigger, an empty list or an unknown trigger gives no band, so the calculation keeps the refurbishment band (each asserted)",
    safe(() => [on.slBand(undefined), on.slBand([]), on.slBand(["something_else"]), on.slBand(null)]), [null, null, null, null]);
  const runNarrow = (gates, t) => safe(() => withLayer(() => hi(liftGated("supported_living", gates).runEngine(base({ trigger: t }))), NARROW));
  const today = hi(liftGated("supported_living", []).runEngine(base({ trigger: ["purchase"] })));
  check("AJ5 — with a narrower purchase band (test copy): off, a purchase reads the refurbishment band as today; on, it reads its own and the ceiling drops to 15/25 of it",
    [runNarrow([], ["purchase"]) === today, Math.abs(runNarrow(SW, ["purchase"]) - today * 0.15 / 0.25) < 1],
    [true, true]);
  check("AJ5 N4 — on, an unknown trigger keeps today's figure; off, the switch value in the copy is still false",
    [runNarrow(SW, ["something_else"]) === hi(liftGated("supported_living", []).runEngine(base({ trigger: ["something_else"] }))), safe(() => off.SWITCHES.sl_band_by_trigger)],
    [true, false]);
}

if (startSuite("AK", "Phase 153f — the election window reads the clock it is given")) {
  const safe = fn => { try { return fn(); } catch (e) { return "threw: " + e.message; } };
  const W = s => safe(() => CB_ELECTION.windowOpen(s));
  /* acquisition 1 Jan 2024: the window closes two years later, about 1 Jan 2026. */
  const PAST = { acquisition_date: "2024-01-01" };
  /* acquisition 1 Jun 2026: the window closes about 1 Jun 2028, after any real date this suite will run on. */
  const FUTURE = { acquisition_date: "2026-06-01" };
  check("AK1 — a clock given inside a window that the real clock says is closed: open",
    [W(Object.assign({ __now: "2025-12-01" }, PAST)), W(Object.assign({ __now: "2024-06-01T09:00:00Z" }, PAST))], [true, true]);
  check("AK2 — a clock given after a window that the real clock says is still open: closed",
    [W(Object.assign({ __now: "2028-12-01" }, FUTURE)), W(Object.assign({ __now: "2030-01-01" }, FUTURE))], [false, false]);
  check("AK3 — either side of the same deadline, a day apart",
    [W(Object.assign({ __now: "2025-12-30" }, PAST)), W(Object.assign({ __now: "2026-01-03" }, PAST))], [true, false]);
  check("AK4 N4 — no acquisition date is still not known, whatever the clock; no clock given falls back to the real one",
    [W({ __now: "2025-12-01" }), W(Object.assign({}, PAST)), W(Object.assign({}, FUTURE))], [null, false, true]);
  check("AK5 — a clock that cannot be read falls back to the real one rather than opening the window",
    [W(Object.assign({ __now: "not a date" }, PAST))], [false]);
}

if (startSuite("AL", "Phase 157a — the questions after a pooling nil are not asked (from 154a1 line 13(a))")) {
  const safe = fn => { try { return fn(); } catch (e) { return "threw: " + e.message; } };
  const PFX = { care_homes: "Q", dental: "D", supported_living: "S", gp: "G", private_hospital: "H" };
  const ALL_GATES = (layerSrc.slice(layerSrc.indexOf("var CB_CTA"), layerSrc.indexOf("};", layerSrc.indexOf("var CB_CTA")))
    .match(/^\s*([a-z0-9_]+)\s*:\s*false/gm) || []).map(x => x.replace(/:.*$/, "").trim());
  const MODS = {}; const mod = (sec, on) => (MODS[sec + on] = MODS[sec + on] || liftGated(sec, on ? ALL_GATES : []));
  const ids = (sec, on) => (mod(sec, on).Q || []).map(q => q.id);
  const qOf = (sec, id, on) => (mod(sec, on).Q || []).find(q => q.id === id);
  /* The two A-2 questions are tested with THEIR switch alone: with every switch on, A-3
     (fvr_requires_past_owner_claim) hides the block for any seller who never claimed, nil or not - its own rule. */
  const A2 = {}; const modA2 = sec => (A2[sec] = A2[sec] || liftGated(sec, ["s187a_6b_statements_route"]));
  const J = x => JSON.stringify(x);
  /* A seller known able to claim (a tax-paying business), who never claimed, and stopped owning in 2019: poolingAssess
     gives NIL. Each case below changes ONE fact of it. */
  const NIL = { trigger: ["purchase"], deal: "property", claimant_type: "company", prior_owner_entitled: "yes", prior_owner_claimed: "no",
                past_owner_cessation_date: "2019-06-01" };
  const session = extra => Object.assign({ flags: [], assumptions: [] }, JSON.parse(JSON.stringify(NIL)), extra || {});
  const drop = (o, k) => { const c = Object.assign({}, o); delete c[k]; return c; };
  /* Each hidden question, with the facts that would otherwise show it (its own earlier answers), and whether it needs
     the switches on (the two A-2 questions are shown only with CB_CTA.s187a_6b_statements_route on). */
  const HIDDEN = [["14fvr", {}, false], ["14po", {}, false],
    ["14pol", { past_owner_disposal_mode: "new_lease_premium" }, false], ["14pold", { past_owner_disposal_mode: "new_lease_premium" }, false],
    ["14iv", { intervening_owner: "yes" }, false], ["14ivd", { intervening_owner: "yes" }, false],
    ["14dvs", { past_owner_disposal_mode: "sold_undervalue" }, false],
    ["14dvsd", { past_owner_disposal_mode: "sold_undervalue", dvs_statement: "held" }, false],
    ["14dvsv", { past_owner_disposal_mode: "sold_undervalue", dvs_statement: "held" }, false],
    ["14ivne", { intervening_owner: "yes" }, true], ["14st8", { intervening_owner_never_entitled: "yes" }, true]];
  const shown = (sec, sfx, on, s) => safe(() => !!((on ? modA2(sec) : mod(sec, false)).Q || []).find(q => q.id === PFX[sec] + sfx).showIf(s));

  check("AL1 — the date the seller stopped owning (x14pod) comes before the fixed-value question (x14fvr), and x14fvr still comes before the rest of the block (x14po, x14iv), in all five flows, switches off and on",
    [false, true].map(on => SECTORS.map(sec => { const L = ids(sec, on), at = sfx => L.indexOf(PFX[sec] + sfx);
      return at("14pod") >= 0 && at("14pod") < at("14fvr") && at("14fvr") < at("14po") && at("14po") < at("14iv"); })),
    [false, true].map(() => SECTORS.map(() => true)));
  check("AL2 — on a pooling nil every question after the date is hidden: x14fvr and the block's other eleven, in all five flows (each one shown when the seller DID claim)",
    SECTORS.map(sec => HIDDEN.map(([sfx, extra, on]) => [shown(sec, sfx, on, session(extra)), shown(sec, sfx, on, session(Object.assign({}, extra, { prior_owner_claimed: "yes" })))])),
    SECTORS.map(() => HIDDEN.map(() => [false, true])));
  check("AL3 — and the date itself is still asked on a nil, switches off and on (it is what decides the nil)",
    [false, true].map(on => SECTORS.map(sec => safe(() => !!qOf(sec, PFX[sec] + "14pod", on).showIf(session())))), [false, true].map(() => SECTORS.map(() => true)));
  check("AL4 N4 — the claim history \"not sure\" and never given (both asserted), and the date not given: nothing is hidden, in all five flows",
    SECTORS.map(sec => [session({ prior_owner_claimed: "unsure" }), drop(session(), "prior_owner_claimed"), drop(session(), "past_owner_cessation_date"),
                        session({ past_owner_cessation_date: null })]
      .map(s => HIDDEN.every(([sfx, extra, on]) => shown(sec, sfx, on, Object.assign({}, s, extra))))),
    SECTORS.map(() => [true, true, true, true]));
  check("AL5 — a seller who stopped owning before the pooling requirement came in (June 2013) is no nil: nothing is hidden",
    SECTORS.map(sec => HIDDEN.every(([sfx, extra, on]) => shown(sec, sfx, on, session(Object.assign({}, extra, { past_owner_cessation_date: "2013-06-01" })))) ),
    SECTORS.map(() => true));
  check("AL6 — a seller KNOWN never able to claim, or 'not sure' whether it could, is no pooling nil: the fixed-value question is asked as before",
    SECTORS.map(sec => [shown(sec, "14fvr", false, session({ prior_owner_entitled: "unsure" })), shown(sec, "14fvr", false, session({ prior_owner_entitled: "no", earlier_entitled_owner: "yes" }))]),
    SECTORS.map(() => [true, true]));
  check("AL7 — CB_S187A.poolingNil agrees with poolingAssess: true on the nil, false on every other case above",
    safe(() => [CB_S187A.poolingNil(session()), CB_S187A.poolingNil(session({ prior_owner_claimed: "unsure" })), CB_S187A.poolingNil(drop(session(), "prior_owner_claimed")),
      CB_S187A.poolingNil(drop(session(), "past_owner_cessation_date")), CB_S187A.poolingNil(session({ past_owner_cessation_date: "2013-06-01" })),
      CB_S187A.poolingNil(session({ prior_owner_claimed: "yes" })), CB_S187A.poolingNil({})]),
    [true, false, false, false, false, false, false]);
  check("AL8 — the fixed-value answer given earlier is taken back once the date makes the claim nil (Back, then a new date), in all five flows",
    SECTORS.map(sec => safe(() => { const M = mod(sec, false), Q = M.Q, fvr = qOf(sec, PFX[sec] + "14fvr", false), pod = qOf(sec, PFX[sec] + "14pod", false);
      const s = session({ past_owner_cessation_date: "2013-06-01" });
      fvr.onSet(s, "yes"); const before = s.fvr_window_closed;
      pod.onSet(s, "2019-06-01"); M.hide(Q, s, pod);
      return [before, s.fvr_window_closed === undefined || s.fvr_window_closed === null]; })),
    SECTORS.map(() => ["yes", true]));
  check("AL9 — the figure is the same nil whether the hidden answers were given or not (runEngine, all five flows)",
    SECTORS.map(sec => safe(() => { const E = mod(sec, false);
      const a = E.runEngine(session({ base_amount: 1000000 })), b = E.runEngine(session({ base_amount: 1000000, fvr_window_closed: "no", past_owner_disposal_mode: "sold_market", intervening_owner: "no" }));
      return [a.QE && a.QE[1], J(a.QE) === J(b.QE)]; })),
    SECTORS.map(() => [0, true]));
}

if (startSuite("AM", "Phase 157a — the seller whose entitlement is not known, and the words for one who never claimed (from 154a1 line 13(b))")) {
  const safe = fn => { try { return fn(); } catch (e) { return "threw: " + e.message; } };
  const FOUR = ["care_homes", "dental", "gp", "private_hospital"];
  const MODS = {}; const E = sec => (MODS[sec] = MODS[sec] || liftGated(sec, []));
  const base = (sec, extra) => Object.assign({ sector: sec, trigger: ["purchase"], deal: "property", base_amount: 2000000, claimant_type: "company",
    claimant_raw: "company", activity: "trade", dwelling_setting: "institution_commercial", acuity: "normal", flags: [], assumptions: [], lrr: false,
    return_in_time: false, nation: "england", plant_serves: "individual", funding: "no" }, extra || {});
  const run = (sec, extra) => safe(() => { const s = base(sec, extra); const r = E(sec).runEngine(s);
    return { lo: r.QE ? r.QE[0] : NaN, hi: r.QE ? r.QE[1] : NaN, flags: s.flags.slice(), A: (r.assumptions || s.assumptions || []).slice() }; });
  const UNK = /SELLER'S ENTITLEMENT NOT KNOWN/;
  const BEST = /\(best case\)/;
  const drop = (o, k) => { const c = Object.assign({}, o); delete c[k]; return c; };
  const CASES = [{ prior_owner_entitled: "unsure", prior_owner_claimed: "no" }, { prior_owner_claimed: "no" },
                 { prior_owner_entitled: "unsure", prior_owner_claimed: "unsure" }, {}];

  check("AM1 N4 — entitlement 'not sure' and never asked (both asserted), with no claim known ('no', 'not sure', never asked): nil at the bottom, flagged, never called the best case - four flows",
    FOUR.map(sec => CASES.map(c => { const r = run(sec, c); return [r.lo, r.hi > 0, r.flags.some(f => UNK.test(f)), r.A.some(a => BEST.test(a))]; })),
    FOUR.map(() => CASES.map(() => [0, true, true, false])));
  check("AM2 — and the top of the range is where it was: the same as for a seller that could never claim",
    FOUR.map(sec => CASES.map(c => run(sec, c).hi === run(sec, { prior_owner_entitled: "no", earlier_entitled_owner: "no", prior_owner_claimed: "no" }).hi)),
    FOUR.map(() => CASES.map(() => true)));
  check("AM3 — a seller that could never claim (branch B1) is unchanged: upper half, the best case, no new flag",
    FOUR.map(sec => { const r = run(sec, { prior_owner_entitled: "no", earlier_entitled_owner: "no", prior_owner_claimed: "no" });
      return [r.lo > 0, r.A.some(a => BEST.test(a)), r.flags.some(f => UNK.test(f))]; }),
    FOUR.map(() => [true, true, false]));
  const D = { prior_owner_entitled: "yes", prior_owner_claimed: "no", past_owner_cessation_date: "2013-06-01" };
  check("AM4 — branch D (able to claim, never did, stopped owning April 2012 to April 2014): the same figure as a seller that could never claim, and words that say so - not 'no prior entitlement' or 'never able to claim'",
    FOUR.map(sec => { const r = run(sec, D), b = run(sec, { prior_owner_entitled: "no", earlier_entitled_owner: "no", prior_owner_claimed: "no", past_owner_cessation_date: "2013-06-01" });
      return [r.lo === b.lo && r.hi === b.hi, r.A.some(a => /between April 2012 and April 2014/.test(a)), r.A.some(a => /no prior entitlement|never able to claim|\(best case\)/.test(a))]; }),
    FOUR.map(() => [true, true, false]));
  check("AM5 — before April 2012 (Rulebook B row A4): a figure, and words that say the second-hand fixtures rules had not begun",
    FOUR.map(sec => { const r = run(sec, Object.assign({}, D, { past_owner_cessation_date: "2011-06-01" }));
      return [r.hi > 0, r.A.some(a => /before April 2012, before the second-hand fixtures rules began/.test(a))]; }),
    FOUR.map(() => [true, true]));
  check("AM6 — able to claim, never did, stopped owning in 2019 (C1): still nil, and no longer described as a seller never able to claim",
    FOUR.map(sec => { const r = run(sec, Object.assign({}, D, { past_owner_cessation_date: "2019-06-01" }));
      return [r.lo, r.hi, r.A.some(a => /no prior entitlement|never able to claim/.test(a))]; }),
    FOUR.map(() => [0, 0, false]));
  check("AM7 — a seller that claimed, and a purchase where the seller's entitlement is known, raise no unknown-seller flag",
    FOUR.map(sec => [run(sec, { prior_owner_entitled: "yes", prior_owner_claimed: "yes" }), run(sec, { prior_owner_entitled: "unsure", prior_owner_claimed: "yes" }),
      run(sec, D)].map(r => r.flags.some(f => UNK.test(f)))),
    FOUR.map(() => [false, false, false]));
  check("AM8 — supported living, which has no best-case step, is untouched: no unknown-seller flag",
    CASES.map(c => run("supported_living", c).flags.some(f => UNK.test(f))), CASES.map(() => false));
  check("AM9 — not a purchase: nothing changes",
    FOUR.map(sec => run(sec, { trigger: ["new_build"], prior_owner_claimed: "no" }).flags.some(f => UNK.test(f))), FOUR.map(() => false));
}

/* ------------------------------------------------------------------- report */
console.log("\n" + "=".repeat(72));
console.log("  pass " + results.pass + "   fail " + results.fail +
            "   xfail " + results.xfail + "   xpass " + results.xpass);
if (results.fail || results.xpass) {
  console.log("\n  Unexpected results:");
  failures.forEach(f => console.log("   [" + f.suite + "] " + f.name +
    (f.note ? "\n       " + f.note : "\n       expected " + f.expected + "\n       actual   " + f.actual)));
}
console.log("=".repeat(72) + "\n");
process.exit((results.fail || results.xpass) ? 1 : 0);
