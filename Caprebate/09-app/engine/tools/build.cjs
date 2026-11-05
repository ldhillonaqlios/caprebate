#!/usr/bin/env node
/* =============================================================================
   CAPREBATE ENGINE — THE BUILD                              Phase 161f, 5 Nov 2026

   WHY THIS EXISTS
     The ITRoadway technical audit (2 Nov 2026, section 5): "The claim
     calculator is stored in an unusual way. It is copied out of one very
     large web page file and can't be edited directly, which makes it easy to
     change the wrong file by mistake."

     Until this phase the page was the source and src/generated/ the copy
     (tools/extract.cjs cut it out of "Caprebate site.html"). This phase turned
     it round. THE SOURCE IS src/calculator/ IN THIS PACKAGE, and only there:

       1. edit src/calculator/*.js (between the PAGE fences)
       2. npm run page   = this build (dist/page/), then tools/page-from-engine.cjs,
                           which writes dist/page/ into "Caprebate site.html" and
                           refreshes the back end's copy of the page
       3. tools/verify-page.cjs fails while the page's calculator differs from
          the built engine by one byte, so an edit made in the page turns red.

   WHAT "THE BUILT ENGINE" IS
     Each calculator file holds one PART of the page's engine script between
     its PAGE fences: shared.js the shared CB_ layer (in the page, from
     "var CB_PLANT" up to "/* ===== care_homes"), and each sector file that
     sector's engine (in the page, from just inside its "(function(){" up to
     its RENDERER banner). Everything outside the fences is this package's own
     wrapper (the require line, the renderer shim, module.exports) and never
     goes into the page. The build is that text, unchanged, plus a manifest.

   RUN
     node tools/build.cjs            write dist/page/ and src/calculator/session.d.ts
     node tools/build.cjs --check    exit 1 if session.d.ts or dist/page/ is out of date

   The functions below are exported so the page writer, the page check and the
   back end's test use one definition of where the parts are.
   ============================================================================= */

"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PKG = path.join(__dirname, "..");
const SRC = path.join(PKG, "src", "calculator");
const DIST = path.join(PKG, "dist", "page");
/* The site sits at the repository root, Development/, three levels above the
   package: 09-app/engine -> 09-app -> Caprebate -> Development. */
const SITE = path.join(PKG, "..", "..", "..", "Caprebate site.html");
/* The back end's own copy of the page (Phase 161d1), which the website serves. */
const SITE_COPY = path.join(PKG, "..", "backend", "copies", "Caprebate site.html");

const SECTORS = ["care_homes", "dental", "supported_living", "gp", "private_hospital"];
const PART_FILES = ["shared.js"].concat(SECTORS.map(s => "sector-" + s + ".js"));

const PAGE_OPEN = "/* @@CAPREBATE-PAGE-OPEN@@ */";
const PAGE_CLOSE = "/* @@CAPREBATE-PAGE-CLOSE@@ */";
const SHIM_OPEN = "/* @@CAPREBATE-SHIM-OPEN@@ */";
const SHIM_CLOSE = "/* @@CAPREBATE-SHIM-CLOSE@@ */";

class BuildError extends Error {}
function fail(msg) { throw new BuildError(msg); }

/* ----------------------------------------------------------- the source */

/** The text between a file's PAGE fences: the part that goes into the page. */
function partOf(fileText, file) {
  const a = fileText.indexOf(PAGE_OPEN), b = fileText.indexOf(PAGE_CLOSE);
  if (a < 0 || b < 0 || b < a) fail(file + " has lost its PAGE fences (" + PAGE_OPEN + " ... " + PAGE_CLOSE + ")");
  if (fileText.indexOf(PAGE_OPEN, a + 1) >= 0 || fileText.indexOf(PAGE_CLOSE, b + 1) >= 0) fail(file + " has a PAGE fence twice");
  /* the fence lines themselves, and the newline after the open and before the close, are the wrapper's */
  return fileText.slice(a + PAGE_OPEN.length + 1, b - 1);
}

/** Every CB_ module the shared layer declares, read off the text every time (the list grows). */
function sharedModuleNames(sharedPart) {
  const names = [];
  const re = /^\s*var\s+(CB_[A-Z0-9_]+)\s*=/gm;
  let m;
  while ((m = re.exec(sharedPart))) if (names.indexOf(m[1]) === -1) names.push(m[1]);
  return names;
}

/** Read the six calculator files. dir defaults to src/calculator. */
function readSource(dir) {
  dir = dir || SRC;
  const files = {};
  PART_FILES.forEach(f => {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) fail("missing " + path.relative(PKG, p));
    files[f] = fs.readFileSync(p, "utf8");
  });
  return files;
}

/* What must hold of the parts before they may go into the page. Each failure
   is a sentence that says what to do. */
function partProblems(parts, files) {
  const out = [];
  const shared = parts.shared;
  if (shared.indexOf("var CB_PLANT") !== 0) out.push("shared.js: the page part must start with `var CB_PLANT` (it marks where the part goes in the page)");
  if (shared.indexOf("/* ===== care_homes") >= 0) out.push("shared.js: the page part may not contain `/* ===== care_homes` (it marks where the part ends in the page)");
  const names = sharedModuleNames(shared);
  if (names.length < 18) out.push("shared.js: only " + names.length + " CB_ modules found; the part is not the shared layer");
  if (files) {
    const exp = files["shared.js"].slice(files["shared.js"].indexOf(PAGE_CLOSE));
    names.forEach(n => { if (!new RegExp("\\b" + n + "\\s*:\\s*" + n + "\\b").test(exp)) out.push("shared.js: " + n + " is declared but not in module.exports - add `" + n + ": " + n + "` there"); });
    SECTORS.forEach(s => {
      const t = files["sector-" + s + ".js"];
      const line = (t.match(/^const \{([^}]*)\} = SHARED;$/m) || [])[1] || "";
      const got = line.split(",").map(x => x.trim()).filter(Boolean);
      names.forEach(n => { if (got.indexOf(n) < 0) out.push("sector-" + s + ".js: " + n + " is missing from the `const { ... } = SHARED;` line - add it"); });
    });
  }
  SECTORS.forEach(s => {
    const p = parts.sectors[s];
    ["function runEngine(", "const Q = [", "YIELD_BAND", "function pushFlag("].forEach(t => {
      if (p.indexOf(t) < 0) out.push("sector-" + s + ".js: the page part has lost `" + t + "`");
    });
    if (p.indexOf("//  RENDERER") >= 0) out.push("sector-" + s + ".js: the page part may not contain `//  RENDERER` (it marks where the part ends in the page)");
    if (p.indexOf("})();") >= 0 && p.indexOf('RS["' + s + '"]=') >= 0) out.push("sector-" + s + ".js: the page part may not register the sector (RS[...]=); that is the page's");
    [/\bdocument\s*\.\s*(getElementById|querySelector|createElement|body)\b/,
     /\bwindow\s*\.\s*[A-Za-z_$]/, /\bfetch\s*\(/, /\blocalStorage\b/, /\bsessionStorage\b/]
      .forEach(re => { if (re.test(p)) out.push("sector-" + s + ".js: DOM or network code in the calculator (" + re + ")"); });
  });
  Object.keys(parts.sectors).concat(["shared"]).forEach(k => {
    const p = k === "shared" ? shared : parts.sectors[k];
    if (/<\/script/i.test(p)) out.push((k === "shared" ? "shared.js" : "sector-" + k + ".js") + ": the calculator may not contain </script>; it would end the page's script");
  });
  return out;
}

/** The built engine: { shared, sectors: { <sector>: text } }, from the source files. Throws on a problem. */
function buildParts(dir) {
  const files = readSource(dir);
  const parts = { shared: partOf(files["shared.js"], "shared.js"), sectors: {} };
  SECTORS.forEach(s => { parts.sectors[s] = partOf(files["sector-" + s + ".js"], "sector-" + s + ".js"); });
  const problems = partProblems(parts, files);
  if (problems.length) fail("the calculator cannot go into the page:\n  - " + problems.join("\n  - "));
  return parts;
}

/* ------------------------------------------------------------- the page */

/* Where the engine sits in the page. The SAME boundaries the regression
   harness has always used to lift the engine (and the retired extractor used
   to cut it), so the page, the harness and this package cannot disagree about
   what "the calculator" is. Returns absolute offsets into the page text. */
function locate(page) {
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m, body = null, bodyAt = -1;
  while ((m = re.exec(page))) {
    if (m[1].indexOf("CB_ELECTION") !== -1) { body = m[1]; bodyAt = m.index + m[0].indexOf(m[1]); break; }
  }
  if (body === null) fail("the page has no engine script (no <script> holding CB_ELECTION)");
  const a = body.indexOf("var CB_PLANT");
  const b = body.indexOf("/* ===== care_homes");
  if (a < 0 || b < 0 || b <= a) fail("the page's shared layer cannot be found (var CB_PLANT ... /* ===== care_homes)");
  const where = { shared: [bodyAt + a, bodyAt + b], sectors: {} };
  SECTORS.forEach(s => {
    const marker = "/* ===== " + s + " ===== */";
    const start = body.indexOf(marker);
    if (start < 0) fail("the page has no " + marker);
    const open = body.indexOf("(function(){", start);
    const reg = body.indexOf('RS["' + s + '"]=', open);
    const close = body.indexOf("})();", reg);
    if (open < 0 || reg < 0 || close < 0) fail("the page's " + s + " block cannot be bounded");
    const from = open + "(function(){".length;
    const full = body.slice(from, close);
    const r = full.indexOf("//  RENDERER");
    if (r < 0) fail("the page's " + s + " block has no RENDERER banner");
    const bannerStart = full.lastIndexOf("// ===", r);
    if (bannerStart < 0) fail("the page's " + s + " RENDERER banner has no opening rule");
    where.sectors[s] = [bodyAt + from, bodyAt + from + bannerStart];
  });
  return where;
}

/** The calculator as the page holds it: { shared, sectors }. */
function partsInPage(page) {
  const w = locate(page);
  const out = { shared: page.slice(w.shared[0], w.shared[1]), sectors: {} };
  SECTORS.forEach(s => { out.sectors[s] = page.slice(w.sectors[s][0], w.sectors[s][1]); });
  return out;
}

/** The page with its calculator replaced by the given parts. Everything else is left byte for byte. */
function pageWith(page, parts) {
  let out = page;
  /* one part at a time, re-locating after each, so no offset goes stale */
  SECTORS.slice().reverse().forEach(s => {
    const w = locate(out).sectors[s];
    out = out.slice(0, w[0]) + parts.sectors[s] + out.slice(w[1]);
  });
  const w = locate(out).shared;
  out = out.slice(0, w[0]) + parts.shared + out.slice(w[1]);
  return out;
}

/** Where the page's calculator differs from the built engine: [] when it is exactly the built engine. */
function differences(page, parts) {
  const got = partsInPage(page);
  const out = [];
  const first = (x, y) => { const n = Math.min(x.length, y.length); for (let i = 0; i < n; i++) if (x[i] !== y[i]) return i; return n; };
  const lineAt = (t, i) => t.slice(0, i).split("\n").length;
  /* the line in the source FILE, not in the part: the part starts on the line after the PAGE-OPEN fence */
  const fileLine = (file, partLine) => {
    try {
      const t = fs.readFileSync(path.join(SRC, file), "utf8");
      return t.slice(0, t.indexOf(PAGE_OPEN)).split("\n").length + partLine;
    } catch (e) { return partLine; }
  };
  const cmp = (label, file, inPage, built) => {
    if (inPage === built) return;
    const i = first(inPage, built);
    out.push(label + " differs from src/calculator/" + file + " at line " + fileLine(file, lineAt(built, i)) +
      " (page " + inPage.length + " characters, engine " + built.length + ")");
  };
  cmp("the page's shared layer", "shared.js", got.shared, parts.shared);
  SECTORS.forEach(s => cmp("the page's " + s + " calculator", "sector-" + s + ".js", got.sectors[s], parts.sectors[s]));
  return out;
}

/* ------------------------------------------------- the session facts, derived

   Roughly 190 facts can appear on a session. The ~40 whose values come from a
   question's own option list are read off the five Q arrays here, so their
   types cannot drift from the questions. Nearly every union contains "unsure":
   that is non-negotiable N4 in the type system. `trigger` (an array) and
   `aia_headroom` (the four-state union) are typed by hand in types.ts. */
const HAND_TYPED = ["trigger", "aia_headroom"];

function deriveSessionFacts(dir) {
  dir = dir || SRC;
  const facts = {};
  SECTORS.forEach(s => {
    const mod = require(path.join(dir, "sector-" + s + ".js"));
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
    "/* GENERATED BY 09-app/engine/tools/build.cjs - DO NOT EDIT THIS FILE.\n" +
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

/* ------------------------------------------------------------ dist/page/ */

const sha = t => crypto.createHash("sha256").update(t, "utf8").digest("hex");

/** The files the build writes into dist/page/, by name. */
function distFiles(parts) {
  const files = { "shared.js": parts.shared };
  SECTORS.forEach(s => { files["sector-" + s + ".js"] = parts.sectors[s]; });
  files["manifest.json"] = JSON.stringify({
    builtBy: "09-app/engine/tools/build.cjs",
    from: "09-app/engine/src/calculator/",
    into: "Caprebate site.html (tools/page-from-engine.cjs)",
    sharedModules: sharedModuleNames(parts.shared),
    sectors: SECTORS,
    parts: Object.keys(files).reduce((a, f) => { a[f] = { bytes: Buffer.byteLength(files[f], "utf8"), sha256: sha(files[f]) }; return a; }, {}),
  }, null, 2) + "\n";
  return files;
}

/** The built engine as dist/page/ holds it, or null when there is no build. */
function readDist() {
  if (!fs.existsSync(path.join(DIST, "manifest.json"))) return null;
  const parts = { shared: fs.readFileSync(path.join(DIST, "shared.js"), "utf8"), sectors: {} };
  SECTORS.forEach(s => { parts.sectors[s] = fs.readFileSync(path.join(DIST, "sector-" + s + ".js"), "utf8"); });
  return parts;
}

module.exports = {
  PKG, SRC, DIST, SITE, SITE_COPY, SECTORS, PART_FILES, PAGE_OPEN, PAGE_CLOSE, SHIM_OPEN, SHIM_CLOSE, BuildError,
  partOf, sharedModuleNames, readSource, partProblems, buildParts, locate, partsInPage, pageWith, differences,
  deriveSessionFacts, sessionDts, distFiles, readDist,
};

/* ------------------------------------------------------------------- main */
if (require.main === module) {
  const CHECK = process.argv.includes("--check");
  try {
    const parts = buildParts();
    const dts = sessionDts(deriveSessionFacts());
    const dtsPath = path.join(SRC, "session.d.ts");
    const files = distFiles(parts);
    if (CHECK) {
      const stale = [];
      if (!fs.existsSync(dtsPath) || fs.readFileSync(dtsPath, "utf8") !== dts) stale.push("src/calculator/session.d.ts");
      if (fs.existsSync(DIST)) {
        Object.keys(files).forEach(f => {
          const p = path.join(DIST, f);
          if (!fs.existsSync(p) || fs.readFileSync(p, "utf8") !== files[f]) stale.push("dist/page/" + f);
        });
      }
      if (stale.length) { console.error("STALE: run `npm run build:page` in 09-app/engine - " + stale.join(", ")); process.exit(1); }
      console.log("the build is up to date with src/calculator/ (" + sharedModuleNames(parts.shared).length + " shared modules, " + SECTORS.length + " sectors" +
        (fs.existsSync(DIST) ? "" : "; no dist/page/ here, which is fine: the page check builds in memory") + ").");
      process.exit(0);
    }
    fs.mkdirSync(DIST, { recursive: true });
    Object.keys(files).forEach(f => fs.writeFileSync(path.join(DIST, f), files[f]));
    const dtsChanged = !fs.existsSync(dtsPath) || fs.readFileSync(dtsPath, "utf8") !== dts;
    if (dtsChanged) fs.writeFileSync(dtsPath, dts);
    console.log("built the calculator into dist/page/: " + sharedModuleNames(parts.shared).length + " shared modules, " + SECTORS.length + " sectors" +
      (dtsChanged ? "; src/calculator/session.d.ts rewritten" : ""));
  } catch (e) {
    if (e instanceof BuildError) { console.error("BUILD FAILED: " + e.message); process.exit(1); }
    throw e;
  }
}
