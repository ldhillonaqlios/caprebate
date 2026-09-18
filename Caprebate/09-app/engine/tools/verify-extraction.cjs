#!/usr/bin/env node
/* =============================================================================
   CAPREBATE ENGINE — EXTRACTION VERIFIER                    Phase 102, Block A

   THE CLAIM THIS FILE TESTS
     "The package contains the same engine as the site, unchanged."

     The regression harness proves the package BEHAVES the same, by running the
     same 600-odd assertions against both. This file proves something narrower
     and harder to fake: that the engine TEXT in src/generated/ is the engine
     text in "Caprebate site.html", byte for byte. Two different kinds of
     evidence for the same claim, and a refactor that fooled one would have to
     fool the other too.

   HOW
     Re-slice the site on the same boundaries the extractor used, subtract the
     banner and the fenced RENDERER SHIM from each generated file, and compare
     what is left. Any difference at all - a re-indent, a "tidied" switch table,
     a corrected typo in a help string - fails.

   IT ALSO CHECKS THE THINGS PHASE 102 PROMISED
     no fetch(, no DOM, no storage, no secrets in the package; every CTA switch
     still false; the shared module list still complete.

   EXIT   0 verified   1 the package and the site have diverged
   ============================================================================= */

"use strict";
const fs = require("fs");
const path = require("path");

const PKG = path.join(__dirname, "..");
const GEN = path.join(PKG, "src", "generated");
const SITE = path.join(PKG, "..", "..", "..", "Caprebate site.html");
const SECTORS = ["care_homes", "dental", "supported_living", "gp", "private_hospital"];

let fails = 0, checks = 0;
function ok(name) { checks++; console.log("  ok    " + name); }
function bad(name, detail) { checks++; fails++; console.log("  FAIL  " + name + (detail ? "\n        " + detail : "")); }
function is(name, cond, detail) { cond ? ok(name) : bad(name, detail); }

/* ------------------------------------------------- re-slice the site afresh */
const siteText = fs.readFileSync(SITE, "utf8");
const bodies = []; { const re = /<script[^>]*>([\s\S]*?)<\/script>/g; let m; while ((m = re.exec(siteText))) bodies.push(m[1]); }
const body = bodies.find(b => b.indexOf("CB_ELECTION") !== -1);
if (!body) { console.error("FATAL: no engine script block in the site"); process.exit(1); }

const layer = body.slice(body.indexOf("var CB_PLANT"), body.indexOf("/* ===== care_homes"));

function sectorPure(sector) {
  const start = body.indexOf("/* ===== " + sector + " ===== */");
  const open = body.indexOf("(function(){", start);
  const reg = body.indexOf('RS["' + sector + '"]=', open);
  const close = body.indexOf("})();", reg);
  const full = body.slice(open + "(function(){".length, close);
  const r = full.indexOf("//  RENDERER");
  return full.slice(0, full.lastIndexOf("// ===", r));
}

/* the slice inside a generated file, between its fences */
function generatedSlice(file) {
  const t = fs.readFileSync(path.join(GEN, file), "utf8");
  const a = t.indexOf("/* @@CAPREBATE-SLICE-OPEN@@ */");
  const b = t.indexOf("/* @@CAPREBATE-SLICE-CLOSE@@ */");
  if (a < 0 || b < 0) return null;
  return t.slice(a + "/* @@CAPREBATE-SLICE-OPEN@@ */\n".length, b - 1);
}

console.log("\n── 1. The engine text in the package is the engine text in the site ──\n");

const genLayer = generatedSlice("shared.js");
is("shared layer is byte-identical to the site",
   genLayer === layer,
   genLayer === null ? "no slice fence found in shared.js"
     : "package " + genLayer.length + " bytes, site " + layer.length + " bytes; first difference at index " +
       (function () { const n = Math.min(genLayer.length, layer.length); for (let i = 0; i < n; i++) if (genLayer[i] !== layer[i]) return i; return n; })());

SECTORS.forEach(s => {
  const g = generatedSlice("sector-" + s + ".js"), w = sectorPure(s);
  is(s + " engine is byte-identical to the site", g === w,
     g === null ? "no slice fence" : "package " + g.length + " bytes, site " + w.length + " bytes");
});

console.log("\n── 2. The extractor wrote nothing of its own beyond the fenced shim ──\n");

SECTORS.forEach(s => {
  const t = fs.readFileSync(path.join(GEN, "sector-" + s + ".js"), "utf8");
  const a = t.indexOf("/* @@CAPREBATE-SHIM-OPEN@@ */"), b = t.indexOf("/* @@CAPREBATE-SHIM-CLOSE@@ */");
  const shim = a < 0 ? "" : t.slice(a, b);
  const declared = (shim.match(/^\s*(?:var|function)\s+([A-Za-z_$][\w$]*)/gm) || []).length;
  is(s + " shim declares only idx, history and render",
     /var idx = 0, history = \[\];/.test(shim) && /function render\(\)/.test(shim) && declared === 2,
     "shim declares " + declared + " top-level names");
});

console.log("\n── 3. What the package must not have acquired ──\n");

const pkgFiles = fs.readdirSync(GEN).filter(f => f.endsWith(".js"))
  .map(f => ({ f, t: fs.readFileSync(path.join(GEN, f), "utf8") }));
const allPkg = pkgFiles.map(x => x.t).join("\n");

is("no network calls (fetch)", (allPkg.match(/\bfetch\s*\(/g) || []).length === 0);
is("no XMLHttpRequest / WebSocket", !/\b(XMLHttpRequest|WebSocket|EventSource)\b/.test(allPkg));
is("no DOM access", !/\bdocument\s*\.\s*(getElementById|querySelector|querySelectorAll|createElement|body)\b/.test(allPkg)
   && !/\bwindow\s*\.\s*[A-Za-z_$]/.test(allPkg));
is("no storage", !/\b(localStorage|sessionStorage|indexedDB|document\s*\.\s*cookie)\b/.test(allPkg));
is("no secrets", !/\b(api[_-]?key|secret|password|bearer|authorization|private[_-]?key)\s*[:=]\s*["'][^"']{8,}/i.test(allPkg));
is("no process/env access", !/\bprocess\s*\.\s*env\b/.test(allPkg));

console.log("\n── 4. The gates are still shut ──\n");

const SH = require(path.join(GEN, "shared.js"));
const cta = SH.CB_CTA;
const switches = Object.keys(cta).filter(k => typeof cta[k] === "boolean");
const on = switches.filter(k => cta[k] === true);
is("every CTA switch is false (" + switches.length + " switches counted, not quoted)",
   on.length === 0, "these are ON: " + on.join(", "));
is("the free-register gate is shut",
   SH.CB_REGISTRY && SH.CB_REGISTRY.precondition && SH.CB_REGISTRY.precondition.enabled === false,
   "CB_REGISTRY.precondition.enabled is not false");

console.log("\n── 5. The shared module list is complete ──\n");

const inSite = [...new Set((layer.match(/^\s*var\s+(CB_[A-Z0-9_]+)\s*=/gm) || [])
  .map(s => s.replace(/^\s*var\s+/, "").replace(/\s*=$/, "").trim()))];
const exported = Object.keys(SH);
is("every CB_ module in the site's layer is exported by the package (" + inSite.length + ")",
   inSite.every(n => exported.indexOf(n) !== -1),
   "missing: " + inSite.filter(n => exported.indexOf(n) === -1).join(", "));

const man = JSON.parse(fs.readFileSync(path.join(GEN, "manifest.json"), "utf8"));
is("the manifest records the site it was cut from", typeof man.sourceSha256 === "string" && man.sourceSha256.length === 64);

console.log("\n" + "=".repeat(72));
console.log("  " + (fails ? "FAILED " + fails + " of " + checks : "verified — " + checks + " checks, 0 failures"));
console.log("=".repeat(72) + "\n");
process.exit(fails ? 1 : 0);
