#!/usr/bin/env node
/* =============================================================================
   CAPREBATE - THE ANALYTICS ALLOW-LIST CHECK        Phase 132, 14 September 2026
                                                     (second site builder)

   WHAT IT IS FOR
     Board item 12552691720, "Set up analytics & tracking", is PARKED until the
     website goes live (the WordPress rebuild, item 12937209644). The wrapper
     the Measurement Plan specifies is built now and switched OFF: CB_TRACK in
     the page shell of "Caprebate site.html", enabled false, no measurement id,
     no sink, and no call site anywhere. This file is the build-time test that
     section 5.1 of the plan asks for, so that the day a call site is added it
     cannot pass anything the plan does not allow.

       08-monday-doc-exports/12552691720__Measurement-Plan-Assessment-Funnel-
       and-Launch-Analytics.md, section 5:
         5.1 one wrapper, the only code permitted to call gtag; drops in
             production, throws in development; a build-time test over every
             call site; GA4 not loaded on post-engagement pages at all
         5.2 the ten events      5.3 the nine parameters      5.4 never-send

   WHAT IT CHECKS
     A  THE SCAN. "Caprebate site.html", every 03-app/*.html and every
        09-app/backend/src/web/*.ts:
        A1 no gtag, dataLayer or googletagmanager anywhere outside the CB_TRACK
           block in the site file (the only place allowed to reach a sink);
        A2 every CB_TRACK.track( call is a literal event with a literal
           parameter object, the event is on 5.2, each key is one that event
           may carry, none is on 5.4, and each literal value is allowed by 5.3;
        A3 no call site today: the wrapper ships with none (item parked).
     B  THE WRAPPER, loaded from the site's own text in a sandbox:
        B1 it ships off: enabled false, mode production, no id, no sink;
        B2 its lists are exactly the plan's 5.2, 5.3 and 5.4 - a code edit
           that adds an event or a parameter fails here, because the plan
           says that is a document amendment reviewed by the DPO;
        B3 enabled false: a valid event reaches no sink and no tag is loaded -
           no script element, no gtag, no dataLayer;
        B4 production: an allowed event reaches the sink with only its keys;
           an off-list event, an off-list key, a never-send key and a value
           outside 5.3 are each dropped silently and reach no sink;
        B5 development: the same four each throw;
        B6 load() with enabled true and an id injects exactly one tag, with
           automatic page views and Google Signals off - the positive control
           that shows B3's "no tag" is the switch and not a broken loader.
     C  THE PORTAL. No 09-app/backend/src/web/*.ts view names CB_TRACK or
        reaches gtag: the post-engagement pages load no tag (5.1).

   RUN
     node 03-app/caprebate-analytics-allowlist-check.cjs
     node 03-app/caprebate-analytics-allowlist-check.cjs --against "<site file>"
       Against "Caprebate site.html.pre-132b" (or any copy from before this
       build) B fails: there is no wrapper to load.
     node 03-app/caprebate-analytics-allowlist-check.cjs --self-test
       NEGATIVE CONTROLS. Each plants one defect in an in-memory copy and the
       check MUST FAIL on it: a gtag call outside the wrapper, an off-list
       event, a never-send parameter, a value outside 5.3, a portal call
       site, a wrapper switched on by default, and a wrapper with its
       never-send list emptied. The clean tree must pass. A control that cannot
       fail proves nothing.
     Exit 0 every check holds (or, with --self-test, every control failed as it
     must and the clean run passed); 1 a check failed; 2 it could not run.
   ============================================================================= */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const APP = __dirname;
const ROOT = path.join(APP, "..");
const DEFAULT_SITE = path.join(ROOT, "..", "Caprebate site.html");
const WEB = path.join(ROOT, "09-app", "backend", "src", "web");

function arg(name) { const i = process.argv.indexOf(name); return i === -1 ? null : path.resolve(process.argv[i + 1] || ""); }
function cannot(why) { console.error("COULD NOT RUN: " + why); process.exit(2); }

/* ---------------------------------------------------- the plan, section 5 */
const PLAN_EVENTS = {
  assessment_start: ["entry_channel", "flow_version"],
  assessment_sector_selected: ["sector", "flow_version"],
  assessment_step_view: ["step_id", "step_index", "sector", "flow_version"],
  assessment_step_complete: ["step_id", "step_index", "sector", "flow_version"],
  assessment_step_back: ["step_id", "sector"],
  assessment_save_resume: ["step_id", "action"],
  assessment_figure_shown: ["sector", "nation", "flow_version"],
  assessment_figure_suppressed: ["sector", "nation", "suppression_reason"],
  assessment_engagement_click: ["sector", "flow_version"],
  assessment_error: ["step_id", "error_code"]
};
const PLAN_PARAMS = ["step_id", "step_index", "sector", "nation", "entry_channel", "suppression_reason", "error_code", "action", "flow_version"];
const PLAN_ENUMS = {
  sector: ["care_home", "dental", "gp_primary_care", "supported_living", "private_hospital"],
  nation: ["england", "wales", "scotland", "northern_ireland"],
  entry_channel: ["accountant_referral", "direct", "organic", "paid", "other"],
  suppression_reason: ["nation_not_supported", "sector_out_of_scope", "insufficient_data", "other"],
  action: ["save", "resume"]
};
/* 5.4 by name; a trailing or leading * is a wildcard, as the plan writes it */
const PLAN_NEVER_SEND = ["business_name", "trading_name", "client_name", "contact_name", "email", "phone",
  "address_line_*", "postcode", "uprn", "title_number", "company_number", "epc_rrn", "cqc_location_id", "psc_*",
  "claim_value", "indicative_figure", "figure_band", "spend", "purchase_price", "land_value", "floor_area", "gia",
  "room_count", "user_id", "client_id", "case_id", "*_free_text", "*_notes"];
/* one probe per 5.4 entry: the name itself, or an instance of the wildcard */
const probeOf = n => n.replace(/^\*/, "x").replace(/\*$/, "1");

/* The block starts at its own comment banner, not at the var: the banner explains
   that this is the only code permitted to reach gtag, and naming gtag and
   dataLayer in that sentence is not a call (Phase 132, 15 September 2026). */
const START = "/* ===== CB_TRACK - THE ONE ANALYTICS WRAPPER";
const END = "/* ===== end CB_TRACK ===== */";

/* --------------------------------------------------------- the tree on disk */
function readTree(sitePath) {
  let site;
  try { site = fs.readFileSync(sitePath, "utf8"); } catch (e) { cannot(sitePath + " - " + e.message); }
  const html = fs.readdirSync(APP).filter(f => /\.html$/.test(f))
    .map(f => ({ name: "03-app/" + f, text: fs.readFileSync(path.join(APP, f), "utf8") }));
  let ts = [];
  try {
    ts = fs.readdirSync(WEB).filter(f => /\.ts$/.test(f))
      .map(f => ({ name: "09-app/backend/src/web/" + f, text: fs.readFileSync(path.join(WEB, f), "utf8") }));
  } catch (e) { cannot("cannot read " + WEB + " - " + e.message); }
  if (!ts.length) cannot("no portal views found under " + WEB);
  return { siteName: path.basename(sitePath), site, html, ts };
}

/* ------------------------------------------------------------------- checks */
function lineOf(text, index) { return text.slice(0, index).split("\n").length; }

function wrapperText(site) {
  const a = site.indexOf(START), b = site.indexOf(END, a);
  return (a < 0 || b < 0) ? null : { a, b: b + END.length, text: site.slice(a, b + END.length) };
}

function loadWrapper(site, env) {
  const w = wrapperText(site);
  if (!w) throw new Error("no CB_TRACK block (" + START + " ... " + END + ") in the site file");
  const ctx = vm.createContext(Object.assign({ console }, env || {}));
  vm.runInContext(w.text + "\n;this.__T = CB_TRACK;", ctx);
  return ctx.__T;
}

function parseLiteralObject(body) {
  /* keys and literal values of a flat object literal; null if it is not one */
  const out = [];
  const trimmed = body.trim();
  if (trimmed === "") return out;
  const parts = trimmed.split(/,(?=(?:[^"']*["'][^"']*["'])*[^"']*$)/);
  for (const p of parts) {
    const m = /^\s*["']?([A-Za-z_$][\w$]*)["']?\s*:\s*(.+?)\s*$/.exec(p);
    if (!m) return null;
    let value, literal = true;
    if (/^"[^"]*"$|^'[^']*'$/.test(m[2])) value = m[2].slice(1, -1);
    else if (/^-?\d+(\.\d+)?$/.test(m[2])) value = Number(m[2]);
    else { literal = false; value = m[2]; }
    out.push({ key: m[1], value, literal });
  }
  return out;
}

function runChecks(tree) {
  const results = [];
  const is = (id, name, ok, detail) => results.push({ id, name, ok: !!ok, detail: ok ? "" : (detail || "") });

  /* --- A: the scan --- */
  const w = wrapperText(tree.site);
  const siteOutside = w ? tree.site.slice(0, w.a) + " ".repeat(w.b - w.a) + tree.site.slice(w.b) : tree.site;
  const files = [{ name: tree.siteName, text: siteOutside }].concat(tree.html, tree.ts);
  const TAG = /\bgtag\b|\bdataLayer\b|googletagmanager/g;
  const tagHits = [];
  files.forEach(f => { let m; TAG.lastIndex = 0; while ((m = TAG.exec(f.text))) tagHits.push(f.name + ":" + lineOf(f.text, m.index) + " " + m[0]); });
  is("A1", "no gtag, dataLayer or googletagmanager outside the CB_TRACK block", tagHits.length === 0, tagHits.join("; "));

  const T = (function () { try { return loadWrapper(tree.site); } catch (e) { return null; } })();
  const EVENTS = T ? T.EVENTS : PLAN_EVENTS;
  const neverSend = name => PLAN_NEVER_SEND.some(n => new RegExp("^" + n.replace(/\*/g, ".*") + "$").test(name));
  const valueOk = (key, v) => {
    if (PLAN_ENUMS[key]) return PLAN_ENUMS[key].indexOf(v) !== -1;
    if (key === "step_index") return typeof v === "number" && Number.isInteger(v) && v >= 1;
    if (key === "flow_version") return typeof v === "string" && /^\d{4}-\d{2}-[a-z]$/.test(v);
    if (T && T.PARAMS[key] && T.PARAMS[key].oneOf) return T.PARAMS[key].oneOf.indexOf(v) !== -1;
    return false;
  };
  const CALL = /CB_TRACK\s*\.\s*track\s*\(/g;
  const callProblems = [];
  let callCount = 0;
  files.forEach(f => {
    let m; CALL.lastIndex = 0;
    while ((m = CALL.exec(f.text))) {
      callCount++;
      const where = f.name + ":" + lineOf(f.text, m.index);
      const rest = f.text.slice(m.index + m[0].length);
      const lit = /^\s*(["'])([^"']*)\1\s*(?:,\s*\{([^{}]*)\})?\s*\)/.exec(rest);
      if (!lit) { callProblems.push(where + " is not a literal event with a literal parameter object, so it cannot be checked"); continue; }
      const event = lit[2];
      if (!Object.prototype.hasOwnProperty.call(PLAN_EVENTS, event)) { callProblems.push(where + " event not on 5.2: " + event); continue; }
      const kv = parseLiteralObject(lit[3] || "");
      if (kv === null) { callProblems.push(where + " parameters are not a flat literal object"); continue; }
      kv.forEach(p => {
        if (neverSend(p.key)) callProblems.push(where + " never-send parameter (5.4): " + p.key);
        else if (PLAN_EVENTS[event].indexOf(p.key) === -1) callProblems.push(where + " parameter not allowed on " + event + ": " + p.key);
        else if (p.literal && !valueOk(p.key, p.value)) callProblems.push(where + " value not allowed for " + p.key + ": " + JSON.stringify(p.value));
      });
      if (EVENTS !== PLAN_EVENTS && !Object.prototype.hasOwnProperty.call(EVENTS, event)) callProblems.push(where + " event not in the wrapper's list: " + event);
    }
  });
  is("A2", "every CB_TRACK.track( call site is literal and on the lists (5.2, 5.3, 5.4)", callProblems.length === 0, callProblems.join("; "));
  is("A3", "no call site today - the wrapper ships with none while the item is parked", callCount === 0, callCount + " call site(s) found");

  /* --- B: the wrapper --- */
  if (!T) {
    is("B0", "the CB_TRACK wrapper loads from the site's own text", false,
       (function () { try { loadWrapper(tree.site); return "?"; } catch (e) { return e.message; } })());
  } else {
    is("B1", "it ships off: enabled false, mode production, no measurement id, no sink",
       T.CONFIG.enabled === false && T.CONFIG.mode === "production" && T.CONFIG.measurement_id === null && T.CONFIG.sink === null,
       JSON.stringify({ enabled: T.CONFIG.enabled, mode: T.CONFIG.mode, measurement_id: T.CONFIG.measurement_id, sink: typeof T.CONFIG.sink }));
    const sortJ = o => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k].slice().sort()]));
    is("B2a", "its events are exactly 5.2, each with exactly its own parameters", sortJ(T.EVENTS) === sortJ(PLAN_EVENTS), sortJ(T.EVENTS));
    is("B2b", "its parameters are exactly 5.3, and every enum 5.3 spells out is spelled out the same",
       JSON.stringify(Object.keys(T.PARAMS).sort()) === JSON.stringify(PLAN_PARAMS.slice().sort()) &&
       Object.keys(PLAN_ENUMS).every(k => T.PARAMS[k] && JSON.stringify((T.PARAMS[k].oneOf || []).slice().sort()) === JSON.stringify(PLAN_ENUMS[k].slice().sort())),
       JSON.stringify(Object.keys(T.PARAMS)));
    const blocked = PLAN_NEVER_SEND.map(probeOf).filter(p => !T.NEVER_SEND.some(re => re.test(p)));
    const fresh = () => loadWrapper(tree.site);
    is("B2c", "its never-send list blocks every 5.4 name and wildcard", blocked.length === 0 && PLAN_NEVER_SEND.length === T.NEVER_SEND.length,
       "not blocked: " + blocked.join(", ") + " (" + T.NEVER_SEND.length + " patterns)");

    const GOOD = ["assessment_step_view", { step_id: "ownership", step_index: 2, sector: "dental", flow_version: "2026-09-a" }];
    const BAD = [
      ["an off-list event", ["assessment_abandon", {}]],
      ["an off-list key", ["assessment_start", { entry_channel: "direct", page_title: "x" }]],
      ["a never-send key", ["assessment_start", { entry_channel: "direct", postcode: "ZZ1 1ZZ" }]],
      ["a value outside 5.3", ["assessment_sector_selected", { sector: "care_homes", flow_version: "2026-09-a" }]]
    ];

    /* B3: off */
    (function () {
      let created = 0; const doc = { createElement() { created++; return {}; }, head: { appendChild() {} } }; const win = {};
      const sandbox = { document: doc, window: win };
      const Toff = loadWrapper(tree.site, sandbox);
      let calls = 0; Toff.CONFIG.sink = () => { calls++; };
      const sent = Toff.track(GOOD[0], GOOD[1]);
      const loaded = Toff.load(doc, win);
      is("B3", "enabled false: a valid event reaches no sink, and no tag is loaded - no script, no gtag, no dataLayer",
         sent === false && calls === 0 && loaded === false && created === 0 && win.gtag === undefined && win.dataLayer === undefined,
         JSON.stringify({ sent, calls, loaded, created, gtag: typeof win.gtag, dataLayer: typeof win.dataLayer }));
    })();

    /* B4: production */
    (function () {
      const Tp = fresh(); const got = [];
      Tp.CONFIG.enabled = true; Tp.CONFIG.sink = (e, p) => got.push([e, p]);
      const okSent = Tp.track(GOOD[0], GOOD[1]);
      is("B4a", "production: an allowed event reaches the sink with exactly its keys",
         okSent === true && got.length === 1 && got[0][0] === GOOD[0] && JSON.stringify(Object.keys(got[0][1]).sort()) === JSON.stringify(Object.keys(GOOD[1]).sort()),
         JSON.stringify(got));
      BAD.forEach(([what, call], i) => {
        const before = got.length; let threw = false, r;
        try { r = Tp.track(call[0], call[1]); } catch (e) { threw = true; }
        is("B4" + String.fromCharCode(98 + i), "production: " + what + " is dropped silently and reaches no sink",
           !threw && r === false && got.length === before, JSON.stringify({ threw, r, sinkCalls: got.length - before }));
      });
    })();

    /* B5: development */
    (function () {
      const Td = fresh(); let calls = 0;
      Td.CONFIG.enabled = true; Td.CONFIG.mode = "development"; Td.CONFIG.sink = () => { calls++; };
      BAD.forEach(([what, call], i) => {
        let threw = false; try { Td.track(call[0], call[1]); } catch (e) { threw = /CB_TRACK refused/.test(e.message); }
        is("B5" + String.fromCharCode(97 + i), "development: " + what + " throws a visible error and reaches no sink", threw && calls === 0, "did not throw");
      });
    })();

    /* B6: the positive control for the loader */
    (function () {
      const made = []; const doc = { createElement(t) { const el = { tag: t }; made.push(el); return el; }, head: { appendChild() {} } };
      const win = {};
      const Tl = fresh(); Tl.CONFIG.enabled = true; Tl.CONFIG.measurement_id = "G-TEST123";
      const ok = Tl.load(doc, win);
      const cfg = (win.dataLayer || []).map(a => Array.prototype.slice.call(a)).find(a => a[0] === "config");
      is("B6", "switched on with an id, load() injects exactly one tag, page views and Google Signals off",
         ok === true && made.length === 1 && /googletagmanager\.com\/gtag\/js\?id=G-TEST123$/.test(made[0].src || "") &&
         !!cfg && cfg[2] && cfg[2].send_page_view === false && cfg[2].allow_google_signals === false,
         JSON.stringify({ ok, made, cfg }));
    })();
  }

  /* --- C: the portal --- */
  const portal = [];
  tree.ts.forEach(f => { const re = /CB_TRACK|\bgtag\b|\bdataLayer\b|googletagmanager/g; let m; while ((m = re.exec(f.text))) portal.push(f.name + ":" + lineOf(f.text, m.index) + " " + m[0]); });
  is("C1", "no post-engagement portal view names CB_TRACK or reaches a tag (" + tree.ts.length + " views scanned)", portal.length === 0, portal.join("; "));

  return results;
}

function report(results, title) {
  console.log("\n── " + title + " " + "─".repeat(Math.max(0, 60 - title.length)));
  results.forEach(r => console.log("  " + (r.ok ? "ok    " : "FAIL  ") + r.id + "  " + r.name + (r.ok ? "" : "\n          " + r.detail)));
  const fails = results.filter(r => !r.ok).length;
  console.log("  " + (fails ? fails + " of " + results.length + " FAILED" : results.length + " checks, 0 failures"));
  return fails;
}

/* --------------------------------------------------------------- self-test */
function selfTest() {
  const clean = readTree(DEFAULT_SITE);
  const cleanFails = report(runChecks(clean), "clean tree (must pass)");
  const w = wrapperText(clean.site);
  if (!w) cannot("the clean site has no CB_TRACK block, so the controls cannot be planted");
  const plantInPage = snippet => { const at = clean.site.indexOf("<script>") + "<script>".length; return clean.site.slice(0, at) + "\n" + snippet + "\n" + clean.site.slice(at); };
  const inWrapper = (from, to) => { if (clean.site.indexOf(from) < 0) cannot("control anchor not found: " + from); return clean.site.replace(from, to); };
  const controls = [
    ["a planted gtag call outside the wrapper", Object.assign({}, clean, { site: plantInPage('gtag("event", "assessment_start");') }), ["A1"]],
    ["an off-list event at a call site", Object.assign({}, clean, { site: plantInPage('CB_TRACK.track("assessment_abandon", {});') }), ["A2"]],
    ["a never-send parameter at a call site", Object.assign({}, clean, { site: plantInPage('CB_TRACK.track("assessment_start", { entry_channel: "direct", postcode: "ZZ1 1ZZ" });') }), ["A2"]],
    ["a value outside 5.3 at a call site", Object.assign({}, clean, { site: plantInPage('CB_TRACK.track("assessment_sector_selected", { sector: "care_homes", flow_version: "2026-09-a" });') }), ["A2"]],
    ["a call site in a portal view", Object.assign({}, clean, { ts: clean.ts.concat([{ name: "09-app/backend/src/web/planted.ts", text: "CB_TRACK.track('assessment_start', {});" }]) }), ["C1"]],
    ["the wrapper switched on by default", Object.assign({}, clean, { site: inWrapper("{ enabled:false,", "{ enabled:true,") }), ["B1", "B3"]],
    /* the event's own key list still drops a postcode, so only B2c can see this */
    ["the never-send list emptied", Object.assign({}, clean, { site: inWrapper("var NEVER_SEND = [", "var NEVER_SEND = [];var __unused = [") }), ["B2c"]]
  ];
  let bad = 0;
  controls.forEach(([what, tree, mustFail]) => {
    const r = runChecks(tree);
    const failedIds = r.filter(x => !x.ok).map(x => x.id);
    const ok = mustFail.every(id => failedIds.indexOf(id) !== -1);
    console.log("  " + (ok ? "ok    " : "FAIL  ") + "control: " + what + " -> failed " + (failedIds.join(", ") || "nothing") + (ok ? "" : "   (must fail " + mustFail.join(", ") + ")"));
    if (!ok) bad++;
  });
  console.log("\n" + (cleanFails === 0 && bad === 0 ? "SELF-TEST PASSED - the clean tree passes and all " + controls.length + " controls fail as they must"
                                                     : "SELF-TEST FAILED - clean failures " + cleanFails + ", controls that did not fail " + bad));
  process.exit(cleanFails === 0 && bad === 0 ? 0 : 1);
}

if (process.argv.includes("--self-test")) selfTest();
else {
  const sitePath = arg("--against") || DEFAULT_SITE;
  const fails = report(runChecks(readTree(sitePath)), "analytics allow-list check against " + path.basename(sitePath));
  process.exit(fails ? 1 : 0);
}
