#!/usr/bin/env node
/* =============================================================================
   CAPREBATE - THE GATED-EXIT RENDERER PROOF          Phase 127 sweep, 12 Sep 2026

   WHAT IT PROVES
     The site file's own funnel renderer (FN, in "Caprebate site.html") does not
     mislead a prospect the Q1b gate stops. After a gated exit:
       G1  the close screen carries CB_BOOKING's gated_exit offer, and not the
           funnel_close words about "the figure above", which they never saw;
       G2  an email - a channel that books no slot - goes straight to the
           thank-you, with no account screen promising "your figure";
       G3  a telephone booking's slot screen leads to the thank-you, not to the
           account screen;
       G4  the thank-you prints no "Indicative ceiling" and no "What you told us".
     And, as the control on all four, an UNGATED prospect still gets:
       C1  the funnel_close offer;   C2  the account screen after an email;
       C3  a slot leading to the account screen;   C4  the ceiling.
     The back end departs from the site on purpose here - gatedExitPage,
     closePage and gatedThankYouPage in 09-app/backend/src/web/router.ts - and
     this is the check that the site now matches it.

   WHY A SEPARATE FILE
     The regression harness deliberately does not lift FN: it is DOM code. This
     file lifts it with the smallest stub that works - getElementById returns a
     plain object - and every assertion reads the HTML FN wrote into "stage".
     FN sits outside the extraction slices, so nothing here touches the engine.

   RUN
     node 03-app/caprebate-gated-exit-renderer-proof.cjs
     node 03-app/caprebate-gated-exit-renderer-proof.cjs --against "<site file>"
       The negative control: run it against "Caprebate site.html.bak-phase127",
       which predates the correction. G1, G2, G3 and G4 MUST FAIL there, and
       the C checks must still hold. A control that cannot fail proves nothing.
     Exit 0 every check holds; 1 any check fails; 2 it could not run.
   ============================================================================= */
"use strict";
const fs = require("fs");
const path = require("path");

const ai = process.argv.indexOf("--against");
const SITE = ai !== -1
  ? path.resolve(process.argv[ai + 1] || "")
  : path.join(__dirname, "..", "..", "Caprebate site.html");

function cannot(why) { console.error("COULD NOT RUN: " + why); process.exit(2); }

let src;
try { src = fs.readFileSync(SITE, "utf8"); } catch (e) { cannot(SITE + " - " + e.message); }

/* The shared layer, on the same boundaries the harness and the extractor use. */
const layerAt = src.indexOf("var CB_PLANT");
const layerEnd = src.indexOf("/* ===== care_homes", layerAt);
const fnAt = src.indexOf("var FN = (function(){");
const fnEnd = src.indexOf("\n})();", fnAt);
if (layerAt < 0 || layerEnd < 0) cannot("the shared layer was not found in " + SITE);
if (fnAt < 0 || fnEnd < 0) cannot("the funnel renderer FN was not found in " + SITE);
const layer = src.slice(layerAt, layerEnd);
const fnSrc = src.slice(fnAt, fnEnd + "\n})();".length);

const nodes = {};
const document = {
  getElementById: (id) => nodes[id] || (nodes[id] = { id, style: {}, textContent: "", innerHTML: "", scrollTop: 0 }),
};

let FN, BOOKING;
try {
  const lifted = new Function("document", layer + "\n;" + fnSrc + "\n;return { FN: FN, CB_BOOKING: CB_BOOKING };")(document);
  FN = lifted.FN; BOOKING = lifted.CB_BOOKING;
} catch (e) { cannot("the lifted code threw: " + e.message); }

/* FN's own escaping, so a heading is looked for exactly as it is drawn. */
const esc = (x) => String(x == null ? "" : x)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const stage = () => (nodes.stage ? nodes.stage.innerHTML : "");
const gatedOffer = BOOKING.offerAt("gated_exit");
const closeOffer = BOOKING.offerAt("funnel_close");

const results = [];
function check(id, name, fn) {
  let ok = false, why = "";
  try { ok = !!fn(); } catch (e) { why = " (threw: " + e.message + ")"; }
  results.push({ id, name: name + why, ok });
}

/* Q1 -> Q1a -> Q1b, then Continue at Q1b: the gate decides exit or Q1c. */
function reach(taxpayer) {
  FN.start();
  FN.set("is_uk_taxpayer", taxpayer);
  FN.next(); FN.next(); FN.next();
  return stage();
}

/* ---- gated ---------------------------------------------------------------- */
check("G0", "a non-taxpayer is stopped at Q1b and shown the reasoned exit",
  () => /likely little or no claim/.test(reach("no")));
check("G1", "the close after a gated exit carries the gated_exit offer, heading and body",
  () => { reach("no"); FN.go("contact"); const h = stage();
          return h.includes(esc(gatedOffer.heading)) && h.includes(esc(gatedOffer.body)); });
check("G1", "and not the funnel_close words about the figure above",
  () => { reach("no"); FN.go("contact"); const h = stage();
          return !h.includes(esc(closeOffer.heading)) && !h.includes(esc(closeOffer.body)); });
check("G2", "an email after a gated exit goes straight to the thank-you, with no account screen",
  () => { reach("no"); FN.go("contact"); FN.setC("channel", "email"); FN.submitContact(); const h = stage();
          return /Thank you/.test(h) && !/Save your assessment/.test(h); });
check("G3", "a telephone booking after a gated exit: the slot screen leads to the thank-you",
  () => { reach("no"); FN.go("contact"); FN.setC("channel", "phone"); FN.submitContact(); const h = stage();
          return /When shall we call you/.test(h) && /FN\.go\('done'\)/.test(h) && !/FN\.go\('account'\)/.test(h); });
check("G4", "the thank-you after a gated exit prints no ceiling and no 'What you told us'",
  () => { reach("no"); FN.go("contact"); FN.setC("channel", "email"); FN.submitContact(); FN.go("done"); const h = stage();
          return /Thank you/.test(h) && !/Indicative ceiling/.test(h) && !/What you told us/.test(h); });

/* ---- ungated: the control ------------------------------------------------- */
check("C1", "an ungated close still carries the funnel_close offer",
  () => { reach("yes"); FN.go("contact"); return stage().includes(esc(closeOffer.heading)); });
check("C2", "an ungated email still reaches the account screen",
  () => { reach("yes"); FN.go("contact"); FN.setC("channel", "email"); FN.submitContact();
          return /Save your assessment/.test(stage()); });
check("C3", "an ungated telephone booking: the slot screen still leads to the account screen",
  () => { reach("yes"); FN.go("contact"); FN.setC("channel", "phone"); FN.submitContact();
          return /FN\.go\('account'\)/.test(stage()); });
check("C4", "the ungated thank-you still prints the Indicative ceiling",
  () => { reach("yes"); FN.go("done"); return /Indicative ceiling/.test(stage()); });

console.log("THE GATED-EXIT RENDERER PROOF");
console.log("  site file: " + SITE);
for (const r of results) console.log("  " + (r.ok ? "HOLDS " : "FAILS ") + r.id + "  " + r.name);
const bad = results.filter((r) => !r.ok);
console.log(bad.length === 0
  ? "\nGREEN: every check holds (" + results.length + " of " + results.length + ")."
  : "\nRED: " + bad.length + " of " + results.length + " checks do not hold.");
process.exit(bad.length === 0 ? 0 : 1);
