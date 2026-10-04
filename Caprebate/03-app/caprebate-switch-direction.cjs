#!/usr/bin/env node
/* =============================================================================
   WHICH WAY EACH TAX ADVISER SWITCH MOVES A CLAIM — DERIVED IN CODE, NOT READ OFF
   A COMMENT. Phase 153b line 21, 4 October 2026 (moved there from Phase 153a line 2).

   The Blockers page said "nine of the twelve make claims bigger, one only smaller";
   FOR THE ACCOUNTANT's opening counted the first 24 from each switch's own "ON =>"
   line. Both were counts of what the comments SAY. This counts what the engine DOES.

   HOW IT IS COUNTED
     1. A FIXED SET OF STATES. For each of the five sectors, WALKS seeded walks
        through the sector's own flow with EVERY switch on, so every switch's own
        questions are asked and answered. Each answer is drawn by a fixed seed from
        the question's own options (or from a short list of amounts, shares and
        dates), only where the question's showIf shows it, in the flow's order. The
        walks are the same on every run: the seed is fixed and nothing reads the
        clock except the engine's own window tests.
     2. EACH SWITCH ALONE. Every state is run through the engine with every switch
        off, and again with ONE switch on and the rest off - the way the cash route
        proof's --moves-from compares one file with another, but one switch at a
        time on one file.
     3. THE FIGURES COMPARED: the qualifying spend range (QE, both ends), the tax
        saving range (TS, both ends), the cash figure (both ends) and the cash route,
        ranked (an amended return that can repay, above pooling, above nothing). A
        state MOVED UP where at least one of the seven rose (a figure appearing where there was
        none counts as rising) and none fell; MOVED DOWN the other way; MOVED BOTH
        where one rose and another fell in the same state.
     4. THE CLASS of a switch is read off its states: BIGGER (some states up, none
        down), SMALLER (some down, none up), EITHER WAY (some up and some down, or a
        state moving both ways), and NO FIGURE MOVED (no state moved - the switch
        changes words, flags or a basis but no figure on these states).
     A switch NOT REACHED by the walks would be reported as such, never as "no
     figure moved": the tool also counts the states where the switch's own facts
     were set, and says so.

   fvr_requires_past_owner_claim CANNOT MOVE AN ESTIMATE FIGURE, and the tool says so:
   the flows apply the election and s.187A caps only where the seller is KNOWN to have
   claimed (Stage 5), and the switch acts only where the seller is known NOT to have.
   Its figure is the back end's survey pack legal check (09-app/backend/src/web/
   pack-legal.ts), which runs CB_S187A.assess on every purchase.
   RE-RUN BY PHASE 154a1 (line 13), 4 October 2026, after the pooling requirement
   (R-B1) was built into the five flows: it still moves no flow figure (0 of 1540
   states), because the pooling requirement is asked first and settles a seller
   who never claimed before this switch is read. Every other switch kept its
   direction; their counts moved a little, since a purchase from a seller who
   never claimed is now nil or unresolved and leaves less for them to move.
   Before and after: 04-phase-work/phase154a1/proofs/ (OneDrive).

   grant_traced_to_elements is read by the back end's survey pack, not by these
   flows (Suite H, H24), so here it is NO FIGURE MOVED by design; its direction is
   proved in 09-app/backend/test/pack-grants.test.ts, where it moves money either
   way. The tool says so on its line.

   RUN
     node 03-app/caprebate-switch-direction.cjs              the table
     node 03-app/caprebate-switch-direction.cjs --json       the same, as JSON
     node 03-app/caprebate-switch-direction.cjs --walks 400  more walks (default 300)
   Exit 0 when it ran; 2 when it could not.
   ============================================================================= */
"use strict";
const fs = require("fs");
const path = require("path");

const SITE = path.join(__dirname, "..", "..", "Caprebate site.html");
const argAt = (n) => { const i = process.argv.indexOf(n); return i === -1 ? null : process.argv[i + 1]; };
const WALKS = Number(argAt("--walks") || 300);
const JSON_OUT = process.argv.includes("--json");
const EXPLAIN = argAt("--explain");
let explained = 0;
function cannot(why) { console.error("COULD NOT RUN: " + why); process.exit(2); }

let src;
try { src = fs.readFileSync(SITE, "utf8"); } catch (e) { cannot(SITE + " - " + e.message); }
const at = src.indexOf("var CB_PLANT"), end = src.indexOf("/* ===== care_homes", at);
if (at < 0 || end < 0) cannot("the shared layer was not found");
const LAYER = src.slice(at, end);
const CTA = new Function(LAYER + "\n;return CB_CTA;")();
const SWITCHES = Object.keys(CTA).filter((k) => typeof CTA[k] === "boolean");
const SECTORS = ["care_homes", "dental", "supported_living", "gp", "private_hospital"];

function domStub() {
  const el = { style: {}, dataset: {}, files: null, value: "", textContent: "", innerHTML: "", disabled: false,
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    querySelectorAll() { return []; }, querySelector() { return null; }, focus() {}, closest() { return el; },
    appendChild() {}, click() {}, insertAdjacentHTML() {} };
  return { getElementById() { return el; }, querySelector() { return null; }, querySelectorAll() { return []; },
    createElement() { return el; }, addEventListener() {}, body: el };
}
const cache = new Map();
/* A Date that reads a fixed day where a targeted state needs one; the real clock otherwise. */
function clockAt(iso) {
  if (!iso) return Date;
  const fixed = new Date(iso).getTime();
  class D extends Date { constructor(...a) { if (a.length === 0) super(fixed); else super(...a); } static now() { return fixed; } }
  return D;
}
function lift(sector, gates, clock) {
  const key = sector + "|" + gates.join(",") + "|" + (clock || "");
  if (cache.has(key)) return cache.get(key);
  let layer = LAYER;
  gates.forEach((g) => { layer = layer.replace(new RegExp("(" + g + "\\s*:\\s*)false", "g"), "$1true"); });
  const start = src.indexOf("/* ===== " + sector + " ===== */");
  const open = src.indexOf("(function(){", start);
  const reg = src.indexOf('RS["' + sector + '"]=', open);
  const close = src.indexOf("})();", reg);
  if (start < 0 || open < 0 || reg < 0 || close < 0) cannot("the " + sector + " flow was not found");
  const wrapped = "var Date = __Date; var document = __doc, window = __win, RS = {}, SECTORS = {};\n" + layer +
    "\nreturn (function(){\n" + src.slice(open + "(function(){".length, close) +
    "\n return { runEngine: (typeof runEngine==='function') ? runEngine : null, Q: (typeof Q!=='undefined') ? Q : null };\n})();";
  let m;
  try { m = new Function("__doc", "__win", "__Date", wrapped)(domStub(), { addEventListener() {}, location: { href: "" } }, clockAt(clock)); }
  catch (e) { cannot("the " + sector + " flow threw: " + e.message); }
  cache.set(key, m);
  return m;
}

/* mulberry32 - a fixed seed, so the walks are the same on every run */
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const AMOUNTS = [50000, 150000, 400000, 1000000, 2500000];
const SHARES = [10, 25, 40, 75];
const DATES = ["2013-09-01", "2016-06-30", "2019-03-31", "2023-05-01", "2025-06-01", "2026-04-01"];
const NUMBERS = [0, 1, 3, 12];
const SKIP = new Set(["neg", "ref", "info", "reroute", "confirm", "contact"]);

function answerFor(q, r) {
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  switch (q.type) {
    case "single": case "choice": return q.opts && q.opts.length ? pick(q.opts)[0] : undefined;
    case "multi": { const o = (q.opts || []).filter(() => r() < 0.7).map((x) => x[0]); return o.length ? o : (q.opts && q.opts[0] ? [q.opts[0][0]] : []); }
    case "currency": return r() < 0.1 ? undefined : pick(AMOUNTS);
    case "percent": return pick(SHARES);
    case "date": return r() < 0.1 ? undefined : pick(DATES);
    case "number": return pick(NUMBERS);
    case "year": return pick(["2016", "2020", "2024"]);
    default: return undefined;
  }
}

/* One walk: the flow with every switch on, answered in order, only where shown. */
function walk(sector, seed) {
  const M = lift(sector, SWITCHES), Moff = lift(sector, []);
  const r = rng(seed);
  const s = { sector, trigger: [], flags: [], assumptions: [], lrr: false };
  for (const q of M.Q || []) {
    if (!q || SKIP.has(q.type) || typeof q.onSet !== "function") continue;
    let shown = true;
    try { shown = !q.showIf || !!q.showIf(s); } catch (e) { shown = false; }
    if (!shown) continue;
    if (q.optional && r() < 0.25) continue;
    /* An answer that stops the flow at a reasoned negative WHICHEVER WAY the switches sit says nothing about any
       switch, so it is drawn again (up to six times) and the walk goes on. One that stops it only on one side is kept:
       that is a switch acting through a gate. */
    const qOff = (Moff.Q || []).find((x) => x && x.id === q.id);
    let v, tries = 0;
    for (;;) {
      v = answerFor(q, r);
      if (typeof q.gate !== "function" || tries++ >= 6) break;
      const a = JSON.parse(JSON.stringify(s));
      try { q.onSet(a, v); } catch (e) { break; }
      let on = false, off = false;
      try { on = !!q.gate(JSON.parse(JSON.stringify(a))); } catch (e) { on = false; }
      try { off = !qOff || typeof qOff.gate !== "function" ? false : !!qOff.gate(JSON.parse(JSON.stringify(a))); } catch (e) { off = false; }
      if (!(on && off)) break;
    }
    try { q.onSet(s, v); } catch (e) { /* an answer the handler refuses is no answer */ }
    if (!Array.isArray(s.trigger)) s.trigger = [];
  }
  return s;
}

const num = (x) => (typeof x === "number" && isFinite(x) ? x : null);
const NONE = [null, null, null, null, null, null, null];
/* The cash route, ranked: a claim that can amend a return (W1, or W4 with an enquiry open) can bring a repayment;
   pooling (W2) only lowers future tax; W3 and no route give nothing. A move from W2 to W1 is a move UP even where the
   cash range is the same, because the money arrives as a repayment now rather than over years. */
const ROUTE_RANK = { W1: 3, W4: 3, W2: 2, W3: 1 };

/* A question's own gate stops the flow at a reasoned negative: no figure at all. Read on the lift with THESE switches,
   for every question the state shows, so a switch that acts through a gate (the flats, the shared lounge) is seen. */
function stopped(M, s) {
  for (const q of M.Q || []) {
    if (!q || typeof q.gate !== "function") continue;
    let shown = true;
    try { shown = !q.showIf || !!q.showIf(s); } catch (e) { shown = false; }
    if (!shown) continue;
    try { if (q.gate(JSON.parse(JSON.stringify(s)))) return true; } catch (e) { /* a gate that throws stops nothing */ }
  }
  return false;
}

/* THE ONE ANSWER THAT EXISTS ONLY WITH ITS SWITCH ON. With SL-R34 off, "A housing association or registered provider"
   is not offered, and the review says such money "is usually taken off like a grant": so the off twin of a state that
   gives that answer is the same state answering "a grant or public subsidy" at a 25% share. Said, not hidden. */
function offTwin(k, state) {
  if (k === "registered_provider_not_public_body" && state.grant_answer === "registered_provider")
    return Object.assign({}, state, { grant_answer: "some", grant_fraction: 0.25 });
  return state;
}

function figures(sector, gates, state, clock) {
  const M = lift(sector, gates, clock);
  const s = JSON.parse(JSON.stringify(state));
  s.flags = []; s.assumptions = [];
  if (stopped(M, s)) return NONE;
  let out;
  try { out = M.runEngine(s); } catch (e) { return null; }
  const pair = (p) => (Array.isArray(p) ? [num(p[0]), num(p[1])] : [num(p), num(p)]);
  return [].concat(pair(out.QE), pair(out.TS), pair(out.cash), [ROUTE_RANK[out.cashRoute] === undefined ? null : ROUTE_RANK[out.cashRoute]]);
}
function compare(a, b) {
  if (a === null || b === null) return a === b ? "same" : "unrunnable";
  let up = false, down = false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x === y) continue;
    if (x === null && y !== null) up = true;
    else if (x !== null && y === null) down = true;
    else if (Math.abs(y - x) < 0.005) continue;
    else if (y > x) up = true; else down = true;
  }
  return up && down ? "both" : up ? "up" : down ? "down" : "same";
}

/* TARGETED STATES. The walks answer at random, and a few switches need a combination of facts that random answers
   almost never give: a complete election under the wrong label in a closed window, a lease granted for a premium, an
   earlier owner who never claimed, a statement route, a partnership with a company partner. Each state here is one of
   the harness's own fixtures for that switch (the suite named), run in every sector, and compared exactly as a walk is,
   for EVERY switch. The company-partner state needs a day between 31 January and the end of March, so it carries its
   own clock: 15 February 2026, the harness's own day for it (X5). */
const BASE = { trigger: ["purchase"], deal: "property", base_amount: 2000000, claimant_type: "company", activity: "trade",
  dwelling_setting: "institution_commercial", acuity: "normal", lrr: false, sufficient_profit: "yes", aia_headroom: "unsure",
  still_own_property: "yes", nation: "england" };
const SIX = ["amount", "plant", "land", "interest", "utrs", "both"];
const ELECTION = { prior_owner_claimed: "yes", prior_owner_entitled: "yes", election_document: "held", election_content: SIX,
  election_value: 300000, election_scope: "all_fixtures", election_multi_property: "no", transaction_type: "sale",
  past_owner_disposal_mode: "sold_market" };
const TARGETED = [
  { from: "Suite H, H9 (A-2), no election made", facts: { election_document: "no", prior_owner_entitled: "no", earlier_entitled_owner: "yes", prior_owner_claimed: "yes",
    past_owner_disposal_mode: "sold_market", intervening_owner: "yes", intervening_owner_acquisition_date: "2015-01-01",
    intervening_owner_never_entitled: "yes", s187a_8_statements: "held", acquisition_date: "2016-03-01" } },
  { from: "Suite H, H10 (A-3)", facts: { prior_owner_entitled: "yes", prior_owner_claimed: "no", earlier_entitled_owner: "no",
    past_owner_disposal_mode: "sold_market", acquisition_date: "2019-01-01" } },
  { from: "Suite H, H23 (I9-1), the past owner's lease premium, window open", facts: { prior_owner_claimed: "yes", prior_owner_entitled: "yes",
    past_owner_disposal_mode: "new_lease_premium", past_owner_s183_election: "no", acquisition_date: "2026-01-01" } },
  { from: "Suite H, H23 (I9-1), the client's own lease, an election under s.199, window closed", facts: Object.assign({}, ELECTION, {
    transaction_type: "lease_premium", s183_election_made: "no", election_section: "s.199", acquisition_date: "2019-01-01",
    election_notified_date: "2019-02-01" }) },
  { from: "Suite AI, AI6 (EL-W1)", facts: Object.assign({}, ELECTION, { election_section: "s.199", acquisition_date: "2015-01-01",
    election_notified_date: "2015-06-01" }) },
  { from: "Suite AI, AI5 (EL-U1)", facts: Object.assign({}, ELECTION, { election_content: SIX.filter((k) => k !== "utrs"),
    acquisition_date: "2015-01-01", election_notified_date: "2015-06-01" }) },
  { from: "Suite AI, AI7 (EL-C2)", facts: Object.assign({}, ELECTION, { election_seller_cost: 250000, acquisition_date: "2015-01-01",
    election_notified_date: "2015-06-01" }) },
  { from: "Suite X, X5 (AW-2), on 15 February 2026", clock: "2026-02-15T12:00:00Z", facts: { trigger: ["refurb_fitout"], claimant_type: "partnership",
    partnership_has_company_member: true, accounting_period_end: "2024-03-31", return_filed: "yes", completion_date: "2023-10-01" } },
];

const tally = {};
for (const k of SWITCHES) tally[k] = { up: 0, down: 0, both: 0, same: 0, unrunnable: 0, by_sector: {} };
let states = 0;
SECTORS.forEach((sector, si) => {
  for (let w = 0; w < WALKS; w++) {
    const st = walk(sector, 1000 * (si + 1) + w);
    states++;
    const off = figures(sector, [], st);
    for (const k of SWITCHES) {
      const twin = offTwin(k, st);
      const on = figures(sector, [k], st);
      const c = compare(twin === st ? off : figures(sector, [], twin), on);
      if (EXPLAIN === k && c !== "same" && explained < 3) { explained++;
        console.log("EXPLAIN " + k + " " + sector + " " + c + "\n  off " + JSON.stringify(twin === st ? off : figures(sector, [], twin)) + "\n  on  " + JSON.stringify(on) +
          "\n  state " + JSON.stringify(st)); }
      tally[k][c]++;
      const b = tally[k].by_sector[sector] || (tally[k].by_sector[sector] = { up: 0, down: 0, both: 0 });
      if (c === "up" || c === "down" || c === "both") b[c]++;
    }
  }
});

let targeted = 0;
for (const t of TARGETED) for (const sector of SECTORS) {
  const st = Object.assign({ sector, flags: [], assumptions: [] }, BASE, t.facts);
  targeted++; states++;
  const off = figures(sector, [], st, t.clock);
  for (const k of SWITCHES) {
    const c = compare(off, figures(sector, [k], st, t.clock));
    tally[k][c]++;
    const b = tally[k].by_sector[sector] || (tally[k].by_sector[sector] = { up: 0, down: 0, both: 0 });
    if (c === "up" || c === "down" || c === "both") b[c]++;
    if (EXPLAIN === k && c !== "same" && explained < 6) { explained++;
      console.log("EXPLAIN " + k + " " + sector + " [" + t.from + "] " + c + "\n  off " + JSON.stringify(off) + "\n  on  " + JSON.stringify(figures(sector, [k], st, t.clock))); }
  }
}

const PACK_ONLY = new Set(["grant_traced_to_elements", "fvr_requires_past_owner_claim"]);
const PACK_WHY = { grant_traced_to_elements: "read by the survey pack, not these flows: see test/pack-grants.test.ts",
  fvr_requires_past_owner_claim: "the flows cap only a seller KNOWN to have claimed; it moves the survey pack's legal check (pack-legal.ts)" };
function classOf(t, k) {
  if (PACK_ONLY.has(k)) return "PACK ONLY";
  const up = t.up > 0, down = t.down > 0;
  if (t.both > 0 || (up && down)) return "EITHER WAY";
  if (up) return "BIGGER";
  if (down) return "SMALLER";
  return "NO FIGURE MOVED";
}
const rows = SWITCHES.map((k) => ({ switch: k, class: classOf(tally[k], k), up: tally[k].up, down: tally[k].down, both: tally[k].both,
  unmoved: tally[k].same, sectors_moved: Object.keys(tally[k].by_sector).filter((s) => { const b = tally[k].by_sector[s]; return b.up + b.down + b.both > 0; }) }));
const split = {};
rows.forEach((r) => { split[r.class] = (split[r.class] || 0) + 1; });

if (JSON_OUT) {
  console.log(JSON.stringify({ site: path.basename(SITE), walks_per_sector: WALKS, states, targeted, switches: SWITCHES.length, split, rows }, null, 2));
} else {
  console.log("WHICH WAY EACH TAX ADVISER SWITCH MOVES A CLAIM - derived in code");
  console.log("site: " + path.basename(SITE) + " | " + SWITCHES.length + " switches | " + WALKS + " seeded walks a sector, " + states +
    " states (" + (states - targeted) + " from the walks, " + targeted + " targeted) | each switch alone on against all off, the qualifying spend, tax saving and cash ranges compared\n");
  for (const r of rows) {
    console.log((r.class + "               ").slice(0, 16) + " " + (r.switch + "                                      ").slice(0, 38) +
      " up " + String(r.up).padStart(4) + "  down " + String(r.down).padStart(4) + "  both " + String(r.both).padStart(3) +
      "  unmoved " + String(r.unmoved).padStart(4) + (r.sectors_moved.length ? "  (" + r.sectors_moved.join(", ") + ")" : "") +
      (PACK_ONLY.has(r.switch) ? "  - " + PACK_WHY[r.switch] : ""));
  }
  console.log("\nSPLIT: " + Object.keys(split).map((c) => split[c] + " " + c.toLowerCase()).join(", "));
}
process.exit(0);
