#!/usr/bin/env node
/* =============================================================================
   CAPREBATE ENGINE — THE PAGE IS BUILT FROM THE ENGINE      Phase 161f, 5 Nov 2026

   Takes the BUILT engine (dist/page/, written by tools/build.cjs from
   src/calculator/) and writes it into "Caprebate site.html", in the places the
   page has always held it. Nothing else in the page changes, byte for byte.
   Then it refreshes the back end's own copy of the page
   (09-app/backend/copies/, Phase 161d1), which is the copy the website serves.

   ONE WAY ONLY. The engine goes into the page, never the other way: there is
   no tool that copies the page into the engine any more (tools/extract.cjs was
   retired by this phase). An edit made to the calculator inside the page is
   overwritten the next time this runs, and tools/verify-page.cjs fails on it
   until then.

   RUN (from 09-app/engine)
     npm run page                      build, then this: the usual way
     node tools/page-from-engine.cjs   this alone; refuses a missing or stale dist/page/

   It writes the page as bytes (readFileSync, writeFileSync), never with a copy
   command: on the Mac a copy can carry OneDrive's identity with it (the trap
   COORDINATES records, Phase 159e).
   ============================================================================= */

"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const B = require("./build.cjs");

function main() {
  const built = B.readDist();
  if (built === null) {
    console.error("NOT WRITTEN: there is no dist/page/. Run `npm run page` in 09-app/engine (it builds first).");
    return 1;
  }
  /* dist/page/ must be the build of what src/calculator/ says NOW, or an old build would overwrite a newer edit */
  const fresh = B.buildParts();
  if (JSON.stringify(fresh) !== JSON.stringify(built)) {
    console.error("NOT WRITTEN: dist/page/ is older than src/calculator/. Run `npm run page` in 09-app/engine (it builds first).");
    return 1;
  }
  if (!fs.existsSync(B.SITE)) { console.error("NOT WRITTEN: cannot find the site file at " + B.SITE); return 1; }

  const before = fs.readFileSync(B.SITE, "utf8");
  const changed = B.differences(before, built);
  const after = B.pageWith(before, built);
  /* the page must now hold exactly the built engine, and only the calculator may have moved */
  const left = B.differences(after, built);
  if (left.length) { console.error("NOT WRITTEN: the page would still differ - " + left.join("; ")); return 1; }

  if (after !== before) fs.writeFileSync(B.SITE, after);
  console.log(changed.length
    ? "Caprebate site.html now carries the built engine. Changed:\n  - " + changed.join("\n  - ")
    : "Caprebate site.html already carried the built engine (no change).");

  /* the back end serves its own copy of the page: bring it level, with the back end's own tool */
  const copies = path.join(B.PKG, "..", "backend", "tools", "app-copies.cjs");
  execFileSync(process.execPath, [copies, "--write"], { stdio: "inherit" });
  return 0;
}

if (require.main === module) {
  try { process.exit(main()); }
  catch (e) {
    if (e instanceof B.BuildError) { console.error("NOT WRITTEN: " + e.message); process.exit(1); }
    throw e;
  }
}
