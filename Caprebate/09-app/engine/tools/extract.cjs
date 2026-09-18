#!/usr/bin/env node
/* =============================================================================
   CAPREBATE ENGINE — EXTRACTOR                              Phase 102, Block A

   WHAT IT DOES
     Slices the estimate engine out of "Caprebate site.html" and writes it into
     src/generated/ as CommonJS modules. The slices are VERBATIM: every byte of
     engine source in the generated files is a byte from the site file. The only
     text this tool writes of its own is a banner and, per sector, a four-line
     RENDERER SHIM which is fenced by markers so the verifier can subtract it
     again and byte-compare what is left.

   WHY VERBATIM
     Phase 102's single obligation is that extracting the engine changes no tax
     answer. Re-typing 9,000 lines of tax logic cannot be proved safe; slicing
     it and byte-comparing can. `verify-extraction.cjs` re-slices the site and
     asserts equality, and the regression harness runs against both.

   WHERE THE CUTS ARE, AND WHY THOSE EXACTLY
     The shared layer and the five sector engines are lifted on the SAME
     boundaries the regression harness has always used, so the package and the
     harness cannot disagree about what "the engine" is:

       shared layer   "var CB_PLANT"  ->  "/* ===== care_homes"
       sector body    "(function(){"  ->  the "})();" that closes it,
                      as bounded by that sector's `RS["<sector>"]=` line

     One cut is this tool's own and it is the only structural decision here:
     each sector body is cut again at its RENDERER banner. Everything above the
     banner is the engine (YIELD_BAND, Q, pushFlag, runEngine); everything below
     it is DOM code that draws the flow. The package takes only the part above,
     which is why it can honestly claim to contain no DOM.

   THE RENDERER SHIM, AND WHAT IT IS FOR
     Two lines above the banner belong to the renderer rather than the engine:
     `let S = {}` and `function reset(){ ... idx=0; history=[]; render(); }`.
     reset() is the flow's entry point, is never called by runEngine, and is
     inside the verbatim slice. Rather than EDIT the slice to remove it - which
     would forfeit the byte-comparison this whole design rests on - the shim
     declares the three renderer bindings it names. render() throws if anything
     ever calls it, so DOM code cannot execute from this package by accident.

   RUN
     node tools/extract.cjs            rewrite src/generated/
     node tools/extract.cjs --check    exit 1 if the output would differ
   ============================================================================= */

"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PKG = path.join(__dirname, "..");
const OUT = path.join(PKG, "src", "generated");

/* The site sits two levels above the project root, exactly as the regression
   harness reaches it. 09-app/engine/tools -> 09-app/engine -> 09-app ->
   <project root> -> <the folder holding the site>. */
const SITE = path.join(PKG, "..", "..", "..", "Caprebate site.html");

const SECTORS = ["care_homes", "dental", "supported_living", "gp", "private_hospital"];

/* Every CB_ module in the shared layer. RE-DERIVED from the source on every
   run rather than listed here, because the list grows: it was 18 on 6 Sep 2026
   and 20 on 7 Sep, and a hard-coded list would silently drop the next one. */
function deriveSharedModules(layer) {
  const names = [];
  const re = /^\s*var\s+(CB_[A-Z0-9_]+)\s*=/gm;
  let m;
  while ((m = re.exec(layer))) if (names.indexOf(m[1]) === -1) names.push(m[1]);
  return names;
}

function fail(msg) { console.error("EXTRACT FAILED: " + msg); process.exit(1); }

/* ------------------------------------------------------------------ slicing */
function readEngineBody() {
  if (!fs.existsSync(SITE)) fail("cannot find the site file at " + SITE);
  const src = fs.readFileSync(SITE, "utf8");
  const bodies = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(src))) bodies.push(m[1]);
  const body = bodies.find(b => b.indexOf("CB_ELECTION") !== -1);
  if (!body) fail("cannot find the engine script block");
  return { src, body };
}

function sliceLayer(body) {
  const a = body.indexOf("var CB_PLANT");
  const b = body.indexOf("/* ===== care_homes");
  if (a < 0 || b < 0 || b <= a) fail("cannot bound the shared layer");
  return body.slice(a, b);
}

function sliceSector(body, sector) {
  const marker = "/* ===== " + sector + " ===== */";
  const start = body.indexOf(marker);
  if (start < 0) fail("sector block not found: " + sector);
  const open = body.indexOf("(function(){", start);
  const reg = body.indexOf('RS["' + sector + '"]=', open);
  const close = body.indexOf("})();", reg);
  if (open < 0 || reg < 0 || close < 0) fail("cannot bound the IIFE for " + sector);
  const full = body.slice(open + "(function(){".length, close);

  /* cut again at the RENDERER banner - see the header note */
  const r = full.indexOf("//  RENDERER");
  if (r < 0) fail("no RENDERER banner in " + sector + "; the cut point is gone and this tool must not guess");
  const bannerStart = full.lastIndexOf("// ===", r);
  if (bannerStart < 0) fail("RENDERER banner in " + sector + " has no opening rule");
  const pure = full.slice(0, bannerStart);

  /* the cut must not have taken runEngine, Q or the band table with it */
  ["function runEngine(", "const Q = [", "YIELD_BAND", "function pushFlag("].forEach(t => {
    if (pure.indexOf(t) < 0) fail(sector + ": the engine cut lost `" + t + "`");
  });
  /* and it must not have LEFT any DOM behind */
  [/\bdocument\s*\.\s*(getElementById|querySelector|createElement|body)\b/,
   /\bwindow\s*\.\s*[A-Za-z_$]/, /\bfetch\s*\(/, /\blocalStorage\b/, /\bsessionStorage\b/]
    .forEach(re2 => { if (re2.test(pure)) fail(sector + ": DOM or network survived the cut (" + re2 + ")"); });

  return pure;
}

/* ------------------------------------------------------------------ writing */
const SHIM_OPEN = "/* @@CAPREBATE-SHIM-OPEN@@ */";
const SHIM_CLOSE = "/* @@CAPREBATE-SHIM-CLOSE@@ */";

function banner(what, extra) {
  return "" +
    "/* GENERATED BY 09-app/engine/tools/extract.cjs - DO NOT EDIT THIS FILE.\n" +
    "   " + what + "\n" +
    "   Every line between the banners below is a VERBATIM slice of\n" +
    "   \"Caprebate site.html\". Change the site, then re-run the extractor;\n" +
    "   editing here would fork the engine, which is the one thing this\n" +
    "   package exists to prevent. `node tools/verify-extraction.cjs` proves\n" +
    "   the slice still matches the site byte for byte.\n" +
    (extra ? "   " + extra + "\n" : "") +
    "\n" +
    "   NO \"use strict\" HERE, DELIBERATELY. The site's script is sloppy mode\n" +
    "   and so is the harness's `new Function` lift. Adding strict mode would\n" +
    "   change the semantics of the very code this file promises not to change.\n" +
    "*/\n";
}

const SLICE_OPEN = "/* @@CAPREBATE-SLICE-OPEN@@ */";
const SLICE_CLOSE = "/* @@CAPREBATE-SLICE-CLOSE@@ */";

function sharedFile(layer, names) {
  return banner("The shared CB_ layer: " + names.length + " modules.") +
    "\n" + SLICE_OPEN + "\n" + layer + "\n" + SLICE_CLOSE + "\n\n" +
    "module.exports = {\n" +
    names.map(n => "  " + n + ": " + n).join(",\n") + "\n};\n";
}

function sectorFile(sector, pure, names) {
  const shim =
    SHIM_OPEN + "\n" +
    "/* RENDERER SHIM - the only lines in this file the extractor wrote itself.\n" +
    "   The verbatim slice below contains `reset()`, which is the FLOW's entry\n" +
    "   point, not the engine's: it names `idx`, `history` and `render`, all of\n" +
    "   which live in the DOM half of the sector module that this package does\n" +
    "   not take. runEngine never calls reset. These three declarations exist so\n" +
    "   the slice can stay byte-identical instead of being edited, and render()\n" +
    "   throws so that DOM code can never run from inside this package. */\n" +
    "var idx = 0, history = [];\n" +
    "function render() {\n" +
    "  throw new Error(\"@caprebate/engine: render() is the site's DOM renderer and is not part of the engine package.\");\n" +
    "}\n" +
    SHIM_CLOSE + "\n";

  return banner("Sector engine: " + sector + ".",
    "Only the part of the sector module ABOVE its RENDERER banner is here.") +
    "\n" +
    "const SHARED = require(\"./shared.js\");\n" +
    "const { " + names.join(", ") + " } = SHARED;\n\n" +
    shim + "\n" +
    SLICE_OPEN + "\n" + pure + "\n" + SLICE_CLOSE + "\n\n" +
    "module.exports = {\n" +
    "  sector: " + JSON.stringify(sector) + ",\n" +
    "  runEngine: runEngine,\n" +
    "  Q: Q,\n" +
    "  YIELD_BAND: YIELD_BAND,\n" +
    "  pushFlag: pushFlag\n" +
    "};\n";
}

/* ----------------------------------------------- the session facts, derived

   WHY THESE ARE DERIVED AND NOT HAND-WRITTEN
     Roughly 190 facts can appear on a session. Hand-typing them would mean
     inventing a union for every one, from partial evidence - the engine
     usually compares a fact against ONE value and treats everything else as
     the other branch, so `s.claimant_type === "company"` tells you nothing
     about what the other claimant types are called. The Q arrays DO know:
     each option carries the exact literal the flow will store. So the unions
     below are read off the questions themselves and regenerate whenever a
     question changes.

   NOTE WHAT THAT PRODUCES, BECAUSE IT IS THE POINT: nearly every union here
   contains "unsure". That is non-negotiable N4 showing up in the type system
   - "we did not find out" is a value the engine carries, not a gap it fills.

   HAND_TYPED are the facts this generator must NOT emit, because types.ts
   types them properly: `trigger` is a multi-select and is an ARRAY, which the
   scalar derivation below would get wrong, and `aia_headroom` is the union
   the whole phase turns on and is never a plain option list. */
const HAND_TYPED = ["trigger", "aia_headroom"];

function deriveSessionFacts() {
  const facts = {};
  SECTORS.forEach(s => {
    const mod = require(path.join(OUT, "sector-" + s + ".js"));
    mod.Q.forEach(q => {
      if (!q.opts || !q.onSet) return;
      const m = String(q.onSet).match(/s\.([a-z_][a-z0-9_]*)\s*=\s*v\b/);
      if (!m || HAND_TYPED.indexOf(m[1]) !== -1) return;
      (facts[m[1]] = facts[m[1]] || new Set());
      q.opts.forEach(o => facts[m[1]].add(String(o[0])));
    });
  });
  return facts;
}

function sessionDts(facts) {
  const keys = Object.keys(facts).sort();
  return "" +
    "/* GENERATED BY 09-app/engine/tools/extract.cjs - DO NOT EDIT THIS FILE.\n" +
    "   Session facts whose values come from a question's own option list, read\n" +
    "   off the five Q arrays. Optional throughout, deliberately: a fact nobody\n" +
    "   was asked is ABSENT, and absent is not the same as any of its values.\n" +
    "   See types.ts for the facts that are hand-typed and why. */\n\n" +
    "export interface DerivedSessionFacts {\n" +
    keys.map(k => "  readonly " + k + "?: " +
      [...facts[k]].sort().map(v => JSON.stringify(v)).join(" | ") + ";").join("\n") +
    "\n}\n\n" +
    "/** The " + keys.length + " facts above, as a runtime list, for tooling that needs it. */\n" +
    "export declare const DERIVED_SESSION_FACTS: readonly (" +
    keys.map(k => JSON.stringify(k)).join(" | ") + ")[];\n";
}

/* --------------------------------------------------------------------- main */
const CHECK = process.argv.includes("--check");

const { body } = readEngineBody();
const layer = sliceLayer(body);
const names = deriveSharedModules(layer);
if (names.length < 18) fail("only " + names.length + " CB_ modules found; the layer cut is wrong");

const files = {};
files["shared.js"] = sharedFile(layer, names);
SECTORS.forEach(s => { files["sector-" + s + ".js"] = sectorFile(s, sliceSector(body, s), names); });

const sha = t => crypto.createHash("sha256").update(t, "utf8").digest("hex");
files["manifest.json"] = JSON.stringify({
  generatedBy: "09-app/engine/tools/extract.cjs",
  source: "Caprebate site.html",
  sourceSha256: sha(fs.readFileSync(SITE, "utf8")),
  sharedModules: names,
  sectors: SECTORS,
  slices: Object.keys(files).filter(f => f.endsWith(".js")).reduce((a, f) => {
    a[f] = { bytes: Buffer.byteLength(files[f], "utf8") }; return a;
  }, {})
}, null, 2) + "\n";

let differs = [];
Object.keys(files).forEach(f => {
  const p = path.join(OUT, f);
  const old = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  if (old !== files[f]) differs.push(f);
});

if (CHECK) {
  /* session.d.ts is derived by RUNNING the freshly-generated sector modules, so
     it can only be checked against what is already on disk. */
  try {
    const cur = fs.readFileSync(path.join(OUT, "session.d.ts"), "utf8");
    if (cur !== sessionDts(deriveSessionFacts())) differs.push("session.d.ts");
  } catch (e) { differs.push("session.d.ts (missing)"); }
  if (differs.length) {
    console.error("STALE: src/generated/ does not match the site — " + differs.join(", "));
    process.exit(1);
  }
  console.log("src/generated/ is up to date with the site (" + names.length + " shared modules, " + SECTORS.length + " sectors).");
  process.exit(0);
}

fs.mkdirSync(OUT, { recursive: true });
Object.keys(files).forEach(f => fs.writeFileSync(path.join(OUT, f), files[f]));

/* the session facts need the sector modules on disk to be readable, so this
   runs after the write rather than with the rest */
const factsDts = sessionDts(deriveSessionFacts());
fs.writeFileSync(path.join(OUT, "session.d.ts"), factsDts);
console.log("extracted " + names.length + " shared modules and " + SECTORS.length + " sector engines into src/generated/");
console.log("  shared modules: " + names.join(" "));
if (differs.length) console.log("  changed: " + differs.join(", "));
else console.log("  (no change)");
