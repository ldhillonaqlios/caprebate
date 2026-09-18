/* =============================================================================
   CAPREBATE — SITE-FILE REDIRECT HOOK                          Phase 129a

   WHAT IT IS FOR
     The regression harness and the proofs read "Caprebate site.html" from a
     fixed path and cannot be pointed at another copy. To prove that a new
     assertion FAILS on the copy taken before a change, serve that older copy
     in place of the site file for the length of one run:

       NODE_OPTIONS="--require \"<abs path>/03-app/caprebate-site-redirect-hook.cjs\"" \
       CB_SITE_REAL="<abs path>/Caprebate site.html" \
       CB_SITE_ALT="<abs path>/Caprebate site.html.bak-phaseNN" \
       node 03-app/caprebate-regression.cjs

   QUOTE THE PATH INSIDE NODE_OPTIONS. Both copies of the tree sit under
   folders whose names contain spaces, and an unquoted path is split on them:
   node then dies MODULE_NOT_FOUND before the harness starts, which is not a
   red result. Found and verified on the Mac copy, 13 September 2026.

   IT SAYS WHAT IT DID. On exit it prints, to stderr, how many reads of the
   real path it served from the older copy. Zero means nothing was redirected
   and the run proves nothing - check that line before trusting a red result.

   It changes nothing on disk and is loaded only when named in NODE_OPTIONS.
   ============================================================================= */
"use strict";
const fs = require("fs");
const path = require("path");

if (!process.env.CB_SITE_REAL || !process.env.CB_SITE_ALT) {
  process.stderr.write("[redirect-hook] CB_SITE_REAL and CB_SITE_ALT must both be set - nothing redirected\n");
} else {
  const REAL = path.resolve(process.env.CB_SITE_REAL);
  const ALT = path.resolve(process.env.CB_SITE_ALT);
  const original = fs.readFileSync;
  let served = 0;
  fs.readFileSync = function (p, ...rest) {
    if (typeof p === "string" && path.resolve(p) === REAL) { served++; return original.call(fs, ALT, ...rest); }
    return original.call(fs, p, ...rest);
  };
  process.on("exit", () => {
    try { fs.writeSync(2, "[redirect-hook] served " + path.basename(ALT) + " for " + served + " read(s) of " + path.basename(REAL) + "\n"); } catch (e) { /* stderr closed */ }
  });
}
