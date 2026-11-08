#!/usr/bin/env node
/* =============================================================================
   CAPREBATE ENGINE — THE PAGE CARRIES EXACTLY THE BUILT ENGINE
   Phase 161f, 5 Nov 2026 (was tools/verify-extraction.cjs, Phase 102)

   THE CLAIM THIS FILE TESTS
     "The calculator in the page is exactly the built engine."

     The source of the calculator is src/calculator/ in this package. The page,
     "Caprebate site.html", is built from it (npm run page). This check builds
     the engine afresh, in memory, and compares it with the calculator in the
     page, and in the back end's own copy of the page (09-app/backend/copies/),
     byte for byte. An edit made in the page and not in src/calculator/ fails
     here, and says which file to change instead.

   WHERE THE PAGE'S CALCULATOR RUNS, SO NOBODY IS SURPRISED (found 5 Nov 2026)
     In "Caprebate site.html" the calculator's script sits inside the in-page
     assessment (<template id="assessTpl">), which the served website leaves out
     (src/modules/public-site/public-site.ts). So the test website's eligibility check does not
     run the page's copy at all: it runs THIS PACKAGE, on the server
     (backend/src/web/engine.ts imports src/index.ts). The page's copy is what
     the file preview, the regression harness (its default mode) and the 03-app
     proofs read. Both are the same text, and this check is what keeps them so.
     The back end's test/phase161f.test.ts checks the served edition too.

   IT ALSO CHECKS WHAT PHASE 102 PROMISED, now of the source
     no fetch(, no DOM, no storage, no secrets; every CTA switch still false;
     every CB_ module exported; the renderer shim unchanged; the derived
     session types up to date.

   RUN
     node tools/verify-page.cjs              the check
     node tools/verify-page.cjs --self-test  plants an edit to the calculator
                                             inside a copy of the page and proves
                                             this check turns red on it

   EXIT   0 verified   1 the page and the engine differ, or a promise broke
   ============================================================================= */

"use strict";
const fs = require("fs");
const path = require("path");
const B = require("./build.cjs");

let fails = 0, checks = 0;
function ok(name) { checks++; console.log("  ok    " + name); }
function bad(name, detail) { checks++; fails++; console.log("  FAIL  " + name + (detail ? "\n        " + detail : "")); }
function is(name, cond, detail) { cond ? ok(name) : bad(name, detail); }

const FIX = "change the calculator in 09-app/engine/src/calculator/, then run `npm run page` in 09-app/engine (never edit it in the page)";

/* ------------------------------------------------------------- self-test */
function selfTest() {
  const parts = B.buildParts();
  const page = fs.readFileSync(B.SITE, "utf8");
  const cases = [];
  const expect = (name, text, wantRed) => {
    let diffs;
    try { diffs = B.differences(text, parts); } catch (e) { diffs = ["could not read the page: " + e.message]; }
    cases.push([name, wantRed ? diffs.length > 0 : diffs.length === 0, diffs]);
  };
  expect("the page as it is passes", page, false);

  /* a planted edit to a figure inside the shared layer, as someone editing the page by hand would make */
  const w = B.locate(page);
  const shared = page.slice(w.shared[0], w.shared[1]);
  const digit = shared.search(/\b0\.\d+\b/);
  const at = w.shared[0] + digit + 2;
  const planted = page.slice(0, at) + (page[at] === "9" ? "8" : "9") + page.slice(at + 1);
  expect("a figure changed in the page's shared layer is RED", planted, true);

  /* one character in each sector's calculator */
  B.SECTORS.forEach(s => {
    const [a] = B.locate(page).sectors[s];
    const i = page.indexOf("function runEngine(", a);
    expect("an edit to " + s + "'s runEngine in the page is RED", page.slice(0, i) + "function runEngine (" + page.slice(i + "function runEngine(".length), true);
  });

  /* a re-indent is an edit too */
  expect("a whitespace-only change in the calculator is RED", page.slice(0, w.shared[0] + 1) + " " + page.slice(w.shared[0] + 1), true);

  /* and the check does not reach past the calculator: the page's renderer is the page's, not the engine's */
  const r = page.indexOf("//  RENDERER", w.sectors.gp[1]);
  const outside = page.slice(0, r) + "//  RENDERER (planted, outside the calculator)" + page.slice(r + "//  RENDERER".length);
  expect("an edit outside the calculator (a renderer banner) passes", outside, false);

  /* the page writer puts it right */
  expect("writing the engine into the planted page makes it pass again", B.pageWith(planted, parts), false);
  cases.push(["writing the engine into the page as it is changes nothing", B.pageWith(page, parts) === page, []]);

  let held = 0;
  cases.forEach(([name, good, diffs]) => {
    console.log((good ? "  ✔ " : "  ✘ ") + name);
    if (!good) diffs.forEach(d => console.log("      " + d));
    if (good) held++;
  });
  console.log("\nverify-page self-test: " + held + " of " + cases.length + " held");
  return held === cases.length;
}

/* ------------------------------------------------------------------ check */
function main() {
  let parts;
  try { parts = B.buildParts(); }
  catch (e) { if (e instanceof B.BuildError) { console.error("FAIL  " + e.message); return 1; } throw e; }

  console.log("\n── 1. The calculator in the page is exactly the built engine ──\n");

  [["Caprebate site.html", B.SITE], ["the back end's copy (09-app/backend/copies/Caprebate site.html)", B.SITE_COPY]].forEach(([label, file]) => {
    if (!fs.existsSync(file)) { bad(label + " exists", "missing: " + file); return; }
    let diffs;
    try { diffs = B.differences(fs.readFileSync(file, "utf8"), parts); }
    catch (e) { diffs = [e.message]; }
    is(label + " carries exactly the built engine (the shared layer and " + B.SECTORS.length + " sectors)",
       diffs.length === 0, diffs.join("\n        ") + "\n        To fix: " + FIX + ".");
  });

  console.log("\n── 2. The renderer shim is the package's, and unchanged ──\n");

  const files = B.readSource();
  B.SECTORS.forEach(s => {
    const t = files["sector-" + s + ".js"];
    const a = t.indexOf(B.SHIM_OPEN), b = t.indexOf(B.SHIM_CLOSE);
    const shim = a < 0 ? "" : t.slice(a, b);
    const declared = (shim.match(/^\s*(?:var|function)\s+([A-Za-z_$][\w$]*)/gm) || []).length;
    is(s + " shim declares only idx, history and render",
       /var idx = 0, history = \[\];/.test(shim) && /function render\(\)/.test(shim) && declared === 2,
       "shim declares " + declared + " top-level names");
  });

  console.log("\n── 3. What the calculator must not have acquired ──\n");

  const all = B.PART_FILES.map(f => files[f]).join("\n");
  is("no network calls (fetch)", (all.match(/\bfetch\s*\(/g) || []).length === 0);
  is("no XMLHttpRequest / WebSocket", !/\b(XMLHttpRequest|WebSocket|EventSource)\b/.test(all));
  is("no DOM access", !/\bdocument\s*\.\s*(getElementById|querySelector|querySelectorAll|createElement|body)\b/.test(all)
     && !/\bwindow\s*\.\s*[A-Za-z_$]/.test(all));
  is("no storage", !/\b(localStorage|sessionStorage|indexedDB|document\s*\.\s*cookie)\b/.test(all));
  is("no secrets", !/\b(api[_-]?key|secret|password|bearer|authorization|private[_-]?key)\s*[:=]\s*["'][^"']{8,}/i.test(all));
  is("no process/env access", !/\bprocess\s*\.\s*env\b/.test(all));

  console.log("\n── 4. The gates are still shut ──\n");

  const SH = require(path.join(B.SRC, "shared.js"));
  const cta = SH.CB_CTA;
  const switches = Object.keys(cta).filter(k => typeof cta[k] === "boolean");
  const on = switches.filter(k => cta[k] === true);
  is("every CTA switch is false (" + switches.length + " switches counted, not quoted)",
     on.length === 0, "these are ON: " + on.join(", "));
  is("the free-register gate is shut",
     SH.CB_REGISTRY && SH.CB_REGISTRY.precondition && SH.CB_REGISTRY.precondition.enabled === false,
     "CB_REGISTRY.precondition.enabled is not false");

  console.log("\n── 5. Every shared module is exported, and the derived types are current ──\n");

  const names = B.sharedModuleNames(parts.shared);
  const exported = Object.keys(SH);
  is("every CB_ module in the shared layer is exported by the package (" + names.length + ")",
     names.every(n => exported.indexOf(n) !== -1),
     "missing: " + names.filter(n => exported.indexOf(n) === -1).join(", "));
  const dtsPath = path.join(B.SRC, "session.d.ts");
  is("src/calculator/session.d.ts matches the questions",
     fs.existsSync(dtsPath) && fs.readFileSync(dtsPath, "utf8") === B.sessionDts(B.deriveSessionFacts()),
     "run `npm run build:page` in 09-app/engine");

  console.log("\n" + "=".repeat(72));
  console.log("  " + (fails ? "FAILED " + fails + " of " + checks : "verified — " + checks + " checks, 0 failures"));
  console.log("=".repeat(72) + "\n");
  return fails ? 1 : 0;
}

if (require.main === module) {
  if (process.argv.includes("--self-test")) process.exit(selfTest() ? 0 : 1);
  process.exit(main());
}
