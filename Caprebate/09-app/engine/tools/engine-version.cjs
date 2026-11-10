#!/usr/bin/env node
/* =============================================================================
   CAPREBATE ENGINE — ITS VERSION MOVES WITH THE CALCULATOR
   Phase 161m, 10 Nov 2026 (09-app/docs/ARCHITECTURE.md rule 6)

   THE CLAIM THIS FILE TESTS
     "Every change to the calculator (src/calculator/) comes with a new engine
      version, and every version says what changed."

     VERSIONS.json beside package.json lists each version the engine has had,
     with the SHA-256 of every file in src/calculator/ at that version. The
     check (verify-page.cjs section 6) fails when:
       - the calculator's files no longer match the latest version's fingerprint
         (a change made without a new version);
       - package.json's version is not the latest version in VERSIONS.json;
       - a version is listed twice, or does not go up;
       - CHANGELOG.md has no "## <version>" heading for a version.

   TO CHANGE THE CALCULATOR
     1. change src/calculator/, then `npm run page` (the page is built from it);
     2. raise "version" in package.json (semver: a figure that moves is at least
        a minor change);
     3. add "## <version> - <date>" to CHANGELOG.md, saying what changed and why;
     4. `node tools/engine-version.cjs --record` appends the version and its
        fingerprint to VERSIONS.json (it refuses a version already listed).
     Sealed results in the back end keep the version they were made with.

   RUN
     node tools/engine-version.cjs            print the version and the check
     node tools/engine-version.cjs --record   record package.json's version
   ============================================================================= */

"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PKG = path.join(__dirname, "..");
const CALC = path.join(PKG, "src", "calculator");
const VERSIONS = path.join(PKG, "VERSIONS.json");
const CHANGELOG = path.join(PKG, "CHANGELOG.md");

/** The calculator's files, by name, as text. */
function calculatorFiles(dir) {
  dir = dir || CALC;
  const out = {};
  fs.readdirSync(dir).sort().forEach(f => { if (fs.statSync(path.join(dir, f)).isFile()) out[f] = fs.readFileSync(path.join(dir, f), "utf8"); });
  return out;
}

/** One fingerprint of every file: name, a nul, the text, a nul, in name order. */
function calculatorHash(files) {
  const h = crypto.createHash("sha256");
  Object.keys(files).sort().forEach(f => { h.update(f); h.update("\0"); h.update(files[f]); h.update("\0"); });
  return h.digest("hex");
}

function semverParts(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
function semverGreater(a, b) {
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
  return false;
}

/** What is wrong, as plain lines; empty means the version moves with the calculator. */
function versionProblems(o) {
  const out = [];
  const list = (o.versions && o.versions.versions) || [];
  if (list.length === 0) { out.push("VERSIONS.json lists no version: run node tools/engine-version.cjs --record"); return out; }
  const seen = new Set();
  let prev = null;
  list.forEach(e => {
    const p = semverParts(e.version);
    if (!p) out.push("VERSIONS.json: \"" + e.version + "\" is not a version like 1.2.3");
    if (seen.has(e.version)) out.push("VERSIONS.json lists " + e.version + " twice");
    seen.add(e.version);
    if (p && prev && !semverGreater(p, prev)) out.push("VERSIONS.json: " + e.version + " does not go up from the one before it");
    if (p) prev = p;
    if (!/^[0-9a-f]{64}$/.test(String(e.calculator_sha256))) out.push("VERSIONS.json: " + e.version + " has no fingerprint");
    if (!new RegExp("^## " + String(e.version).replace(/\./g, "\\.") + "\\b", "m").test(o.changelog || "")) out.push("CHANGELOG.md has no \"## " + e.version + "\" heading");
  });
  const last = list[list.length - 1];
  if (o.pkgVersion !== last.version) out.push("package.json says " + o.pkgVersion + " but the latest recorded version is " + last.version + ": run node tools/engine-version.cjs --record");
  if (last.calculator_sha256 !== o.hash) {
    out.push("the calculator (src/calculator/) changed but the engine's version (" + last.version + ") did not: raise \"version\" in package.json, say what changed in CHANGELOG.md, then run node tools/engine-version.cjs --record");
  }
  return out;
}

function readState() {
  return {
    pkgVersion: JSON.parse(fs.readFileSync(path.join(PKG, "package.json"), "utf8")).version,
    versions: fs.existsSync(VERSIONS) ? JSON.parse(fs.readFileSync(VERSIONS, "utf8")) : { versions: [] },
    changelog: fs.existsSync(CHANGELOG) ? fs.readFileSync(CHANGELOG, "utf8") : "",
    hash: calculatorHash(calculatorFiles()),
  };
}

function record() {
  const s = readState();
  const list = s.versions.versions || [];
  if (list.some(e => e.version === s.pkgVersion)) {
    const e = list.find(x => x.version === s.pkgVersion);
    if (e.calculator_sha256 === s.hash) { console.log("engine " + s.pkgVersion + " is already recorded, with this calculator"); return 0; }
    console.error("REFUSED: " + s.pkgVersion + " is already recorded with another calculator: raise \"version\" in package.json first");
    return 1;
  }
  const next = { note: s.versions.note, versions: list.concat([{ version: s.pkgVersion, calculator_sha256: s.hash, recorded: new Date().toISOString().slice(0, 10) }]) };
  const p = versionProblems({ ...s, versions: next });
  if (p.length) { p.forEach(l => console.error("REFUSED: " + l)); return 1; }
  fs.writeFileSync(VERSIONS, JSON.stringify(next, null, 1) + "\n");
  console.log("engine " + s.pkgVersion + " recorded in VERSIONS.json");
  return 0;
}

module.exports = { CALC, VERSIONS, CHANGELOG, calculatorFiles, calculatorHash, versionProblems, readState };

if (require.main === module) {
  if (process.argv.includes("--record")) process.exit(record());
  const s = readState();
  const p = versionProblems(s);
  console.log("engine " + s.pkgVersion + "; calculator " + s.hash.slice(0, 12));
  p.forEach(l => console.log("  FAIL  " + l));
  process.exit(p.length ? 1 : 0);
}
