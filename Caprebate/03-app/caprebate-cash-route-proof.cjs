#!/usr/bin/env node
/* =============================================================================
   CAPREBATE - THE CASH ROUTE PROOF                   Phase 127 sweep, 12 Sep 2026
                                                      extended by Phase 129, same day
                                                      and by Phase 129b, 13 Sep 2026

   WHAT IT PROVES
     CB_CASH.computeCashBenefit names the claim route in RULEBOOK A's meaning
     (01-rulebooks/...-Register-A-Claim-Timing-v2.md, section 4), which both Tax
     Implication Summary variants and the report chain key on:
       W1 amend              inside the amendment window
       W2 current-period     window closed, property still owned
          pooling
       W3 closed             window closed, property sold - nil, no cash figure
       W4 enquiry open       never derived: no question captures an open enquiry
     and it keeps HOW THE CASH ARRIVES apart, as `mechanism`, so a loss carried
     back is a mechanism and never a route. Until 12 September 2026 the engine
     used W2, W3 and W4 for a return not yet filed, allowances carried forward
     and a loss carried back - so a still-owned client was called "W3", which
     the report chain routes to a reasoned negative.

       R1  in time                          -> W1, mechanism amend, refund
       R2  a return not yet filed           -> W1, mechanism current_year, no refund
       R3  window closed, still owned       -> W2, mechanism wda_forward, no refund
       R4  window closed, property sold     -> W3, no mechanism, no cash figure
       R5  sold, and the window not known   -> no route at all (N4: unknown opens nothing)
       R6  a loss carried back on W2        -> route stays W2, mechanism loss_carryback
       R7  no state in the matrix below produces W4

   ADDED BY PHASE 129 - W2 NEEDS THE PROPERTY KNOWN TO BE STILL OWNED (N4)
     Until Phase 129 every client whose ownership was not a known "no" reached
     W2 once the window closed - "not sure" and a client never asked alike - and
     a carried-back loss revived a cash figure on any route at all.
       R8   window closed, ownership ABSENT   -> no route, no cash, a reason naming it
       R9   window closed, ownership "unsure" -> exactly what R8 gives
       R10  over the whole matrix, "unsure" and absent ownership give identical
            results in every state - both asserted, never one standing for both
       R11  over the whole matrix, W2 is only ever given on a known "yes", and no
            cash figure stands without a route of W1 or W2
       R12  a carried-back loss revives no cash figure on W3, or where the
            ownership is unknown and the window closed

   ADDED BY PHASE 129b - "NOT SURE" ABOUT THE RETURN, AND WHICH RETURN IT IS
     Until Phase 129b every flow stored "not sure" to "Is the relevant tax
     return still open to amendment?" as false - out of time - so a still-owned
     client got W2 and a cash figure where a client never asked got neither,
     and a sold one got W3 where the other got no route. And the window was
     worked out from the latest year end the client gave, not from the year the
     money was spent in, which Rulebook A section 4 says is the one that counts.
       R13  in all five flows, "not sure" is stored as unanswered and gives
            exactly what an ABSENT answer gives, whatever the ownership (N4)
       R14  "in time" and "out of time" still store true and false
       R15  a window not known and not answered: no route, no cash figure, a
            reason saying it is not yet confirmed, and none saying it has closed
       R16  a window KNOWN to be closed on a sold property still says it has closed
       R17  a completion date years before the year end given closes a window
            that year end alone would open: the year of spend decides
       R18  with the switch off, the year of spend never opens a window the
            year end given had closed - over a matrix, company and individual

   AND, WITH --equivalent-to, THAT A RELABEL CHANGED ONLY THE CODES
     EQV1  over a matrix of states, the cash figure, the reasons and the refund
         flag are identical to the older file's, and the new `mechanism` is
         the key the older file's `route` was found under. It is the proof for
         a pure relabel, so since Phase 129 moved figures on purpose it holds
         only against a file with the same cash rules.
     IT REFUSES, WITH EXIT 2, A FILE THAT ALREADY CARRIES THE NEW KEYS (Phase
     129b). EQV1 reads the older file's route codes as the pre-relabel keys, so
     against a relabelled copy - the site file compared with itself included -
     it could only ever report RED, and that RED was about the command, not
     the engine. There is no relabel between two relabelled copies to prove.

   AND, WITH --moves-from, WHICH FIGURES A CHANGE MOVED
     M1  every state whose cash figure differs from the older file's moved from
         a figure to NO figure - never up, and never to a different figure
     M2  every moved state is one Phase 129 names: ownership not a known "yes"
         with the window closed, or a carried-back loss on a route that is not
         W1 or W2. The moved classes are printed with a count each.
     M3  (Phase 132, 14 September 2026) the same over a matrix of partnership
         and LLP states - a company partner known, known not to be, and not
         known, with period ends placed around today so that today falls
         inside and between the two filing dates. There a route may also move to
         a slower one (W1 to W2), but nothing may move up. The matrix above holds
         companies and sole traders only, so without M3 a partnership move could
         not be seen. Its moved classes are printed with the rest.

   AND, WITH --self-test, THAT THE REFUSAL CAN FAIL (Phase 129b)
     S1  the site file compared with itself is refused: exit 2, the sentence, no RED
     S2  a byte copy compared with itself is refused the same way
     S3  a copy from BEFORE the relabel is not refused: EQV1 runs and reports
     S4  a file that is not there is COULD NOT RUN, not the relabel refusal
     S3 needs a pre-relabel copy: "Caprebate site.html.bak-phase127" beside the
     site file by default, or --pre-relabel "<file>". Without one it exits 2.

   RUN
     node 03-app/caprebate-cash-route-proof.cjs
     node 03-app/caprebate-cash-route-proof.cjs --equivalent-to "<a pre-relabel site file>"
     node 03-app/caprebate-cash-route-proof.cjs --moves-from "<older site file>"
     node 03-app/caprebate-cash-route-proof.cjs --against "<a site file>"
     node 03-app/caprebate-cash-route-proof.cjs --self-test
       The negative controls: against "Caprebate site.html.bak-phase127", R1 to
       R6 MUST FAIL; against "Caprebate site.html.bak-phase129", R8 to R12 MUST
       FAIL; against "Caprebate site.html.bak-phase129b", R13, R15 and R17 MUST
       FAIL.
     Exit 0 every check holds; 1 any check fails; 2 it could not run, or it
     refused a comparison that cannot mean anything.
   ============================================================================= */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

function arg(name) { const i = process.argv.indexOf(name); return i === -1 ? null : path.resolve(process.argv[i + 1] || ""); }
const SITE = arg("--against") || path.join(__dirname, "..", "..", "Caprebate site.html");
const OLDER = arg("--equivalent-to");
const MOVES = arg("--moves-from");
const SELF_TEST = process.argv.includes("--self-test");
const PRE_RELABEL = arg("--pre-relabel") || path.join(path.dirname(SITE), "Caprebate site.html.bak-phase127");

function cannot(why) { console.error("COULD NOT RUN: " + why); process.exit(2); }
function refuse(why) { console.error("REFUSED, NOT RED: " + why); process.exit(2); }

const RELABEL_REFUSAL = "already carries the relabelled route keys";

if (SELF_TEST) selfTest();

function readSite(file) {
  try { return fs.readFileSync(file, "utf8"); } catch (e) { cannot(file + " - " + e.message); }
}

function loadCash(file) {
  const src = readSite(file);
  const at = src.indexOf("var CB_PLANT");
  const end = src.indexOf("/* ===== care_homes", at);
  if (at < 0 || end < 0) cannot("the shared layer was not found in " + file);
  try { return new Function(src.slice(at, end) + "\n;return CB_CASH;")(); }
  catch (e) { cannot("the shared layer in " + file + " threw: " + e.message); }
}

/* THE REFUSAL COMES FIRST, before a single check is run or printed. */
if (OLDER) {
  const OLD = loadCash(OLDER);
  if (OLD.MECHANISM || (OLD.ROUTE && OLD.ROUTE.POOLING)) {
    refuse("--equivalent-to proves a relabel, and " + path.basename(OLDER) + " " + RELABEL_REFUSAL +
      " (ROUTE.POOLING and MECHANISM), so there is no relabel between it and the site file to prove." +
      " Give it a copy from before the relabel, such as Caprebate site.html.bak-phase127," +
      " or compare two relabelled copies with --moves-from.");
  }
}

/* The five sector flows, lifted on the same boundaries the harness uses, for
   the one thing only a flow knows: how it stores an answer. */
const SECTORS = ["care_homes", "dental", "supported_living", "gp", "private_hospital"];
const ASK = "Is the relevant tax return still open to amendment?";
function domStub() {
  const el = {
    style: {}, dataset: {}, files: null, value: "", textContent: "", innerHTML: "", disabled: false,
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    querySelectorAll() { return []; }, querySelector() { return null; }, focus() {}, closest() { return el; },
    appendChild() {}, click() {},
  };
  return { getElementById() { return el; }, querySelector() { return null; }, querySelectorAll() { return []; },
           createElement() { return el; }, addEventListener() {}, body: el };
}
function loadFlows(file) {
  const src = readSite(file);
  const at = src.indexOf("var CB_PLANT");
  const end = src.indexOf("/* ===== care_homes", at);
  if (at < 0 || end < 0) cannot("the shared layer was not found in " + file);
  const layer = src.slice(at, end);
  const out = {};
  for (const sec of SECTORS) {
    const start = src.indexOf("/* ===== " + sec + " ===== */");
    const open = src.indexOf("(function(){", start);
    const reg = src.indexOf('RS["' + sec + '"]=', open);
    const close = src.indexOf("})();", reg);
    if (start < 0 || open < 0 || reg < 0 || close < 0) cannot("the " + sec + " flow was not found in " + file);
    const wrapped = "var document = __doc, window = __win, RS = {}, SECTORS = {};\n" + layer +
      "\nreturn (function(){\n" + src.slice(open + "(function(){".length, close) +
      "\n return { Q: (typeof Q!=='undefined') ? Q : null };\n})();";
    try { out[sec] = new Function("__doc", "__win", wrapped)(domStub(), { addEventListener() {}, location: { href: "" } }); }
    catch (e) { cannot("the " + sec + " flow in " + file + " threw: " + e.message); }
  }
  return out;
}

const CASH = loadCash(SITE);
const FLOWS = loadFlows(SITE);
const results = [];
function check(id, name, fn) {
  let ok = false, why = "";
  try { ok = !!fn(); } catch (e) { why = " (threw: " + e.message + ")"; }
  results.push({ id, name: name + why, ok });
}

/* Every cash gate satisfied, so the route alone decides. */
const base = (extra) => Object.assign({
  sufficient_profit: "yes", aia_headroom: 500000, pool_split_basis: "measured",
  prior_claim_self: false, claimant_type: "company",
}, extra);
const run = (extra) => CASH.computeCashBenefit(base(extra), 100000, 140000, () => {});
/* Everything a reader of the result keys on, less the window's Date objects. */
const face = (r) => JSON.stringify([r.route, r.mechanism, r.cash, r.reasons, r.refundEligible, r.blocked, r.unresolved]);

check("R1", "in time: W1, mechanism amend, refund eligible", () => {
  const r = run({ still_own_property: "yes", return_in_time: true });
  return r.route === "W1" && r.mechanism === "amend" && r.refundEligible === true;
});
check("R2", "a return not yet filed: W1, mechanism current_year, no refund", () => {
  const r = run({ still_own_property: "yes", return_in_time: false, return_filed: "no" });
  return r.route === "W1" && r.mechanism === "current_year" && r.refundEligible === false;
});
check("R3", "window closed, property still owned: W2, mechanism wda_forward, no refund", () => {
  const r = run({ still_own_property: "yes", return_in_time: false, return_filed: "yes" });
  return r.route === "W2" && r.mechanism === "wda_forward" && r.refundEligible === false;
});
check("R4", "window closed, property sold: W3, no mechanism, no cash figure", () => {
  const r = run({ still_own_property: "no", return_in_time: false });
  return r.route === "W3" && r.mechanism === null && r.cash[0] === null && r.cash[1] === null;
});
check("R5", "property sold and the window not known: no route at all", () => {
  const r = run({ still_own_property: "no" });
  return r.route === null && r.mechanism === null && r.cash[0] === null;
});
check("R6", "a loss carried back on W2: the route stays W2, the mechanism is loss_carryback", () => {
  const r = run({ still_own_property: "yes", return_in_time: false, return_filed: "yes",
                  claim_creates_loss: "yes", loss_carried_back: "yes" });
  return r.route === "W2" && r.mechanism === "loss_carryback" && r.refundEligible === true;
});

/* --- Phase 129: W2 needs a KNOWN "yes" -------------------------------------- */
const closed = { return_in_time: false, return_filed: "yes" };
check("R8", "window closed, ownership ABSENT: no W2, no route, no cash figure, and a reason naming ownership", () => {
  const r = run(Object.assign({}, closed));
  return r.route === null && r.mechanism === null && r.cash[0] === null && r.cash[1] === null
    && r.refundEligible === false && r.reasons.some((x) => /still owned is not yet confirmed/.test(x));
});
check("R9", "window closed, ownership \"unsure\": exactly what an absent ownership gives", () => {
  const a = run(Object.assign({}, closed));
  const u = run(Object.assign({ still_own_property: "unsure" }, closed));
  return u.route === null && u.cash[0] === null && face(u) === face(a);
});

/* The matrix: every fact CB_CASH's route reads, including the absent state. */
const matrix = [];
for (const own of ["yes", "no", "unsure", undefined])
  for (const ape of ["2026-03-31", "2019-03-31", undefined])
    for (const who of ["company", "sole_trader"])
      for (const rit of [true, false, undefined])
        for (const rf of ["no", "yes", undefined])
          for (const loss of [true, false])
            for (const prof of ["yes", "no"])
              matrix.push(base({
                still_own_property: own, accounting_period_end: ape, claimant_type: who,
                return_in_time: rit, return_filed: rf, sufficient_profit: prof,
                claim_creates_loss: loss ? "yes" : undefined, loss_carried_back: loss ? "yes" : undefined,
              }));
const cashOf = (C, s) => C.computeCashBenefit(Object.assign({}, s), 100000, 140000, () => {});

check("R7", "no state in the matrix produces W4 (no question captures an open enquiry)", () =>
  matrix.every((s) => CASH.computeCashBenefit(Object.assign({}, s), 1, 2, () => {}).route !== "W4"));

check("R10", "over " + matrix.length + " states: \"unsure\" and ABSENT ownership give identical results in every one", () =>
  matrix.filter((s) => s.still_own_property === undefined).every((s) =>
    face(cashOf(CASH, s)) === face(cashOf(CASH, Object.assign({}, s, { still_own_property: "unsure" }))))
  && matrix.filter((s) => s.still_own_property === "unsure").length === matrix.filter((s) => s.still_own_property === undefined).length);

check("R11", "over " + matrix.length + " states: W2 only on a known \"yes\", and no cash figure without a route of W1 or W2", () =>
  matrix.every((s) => {
    const r = cashOf(CASH, s);
    if (r.route === "W2" && s.still_own_property !== "yes") return false;
    if (r.cash[0] !== null && r.route !== "W1" && r.route !== "W2") return false;
    return true;
  }));

check("R12", "a carried-back loss revives no cash figure on W3, nor on an unknown ownership with the window closed", () => {
  const lossy = { claim_creates_loss: "yes", loss_carried_back: "yes" };
  const w3 = run(Object.assign({ still_own_property: "no" }, closed, lossy));
  const ab = run(Object.assign({}, closed, lossy));
  const un = run(Object.assign({ still_own_property: "unsure" }, closed, lossy));
  return w3.route === "W3" && w3.cash[0] === null && w3.mechanism === null
    && ab.cash[0] === null && ab.mechanism === null
    && un.cash[0] === null && face(un) === face(ab);
});

/* --- Phase 129b: "not sure" about the return, and which return it is -------- */
/* No dates at all, so the window cannot be worked out and only the fallback
   question's answer can decide it. */
const unknownWindow = { return_filed: "yes" };
const fallbackQ = (sec) => ((FLOWS[sec] && FLOWS[sec].Q) || []).find((q) => q.ask === ASK);
const OWNERSHIP = ["yes", "no", "unsure", undefined];

check("R13", "in all five flows, \"not sure\" to the fallback question is stored as unanswered and gives exactly what an ABSENT answer gives, whatever the ownership (N4)", () =>
  SECTORS.every((sec) => {
    const q = fallbackQ(sec);
    if (!q) return false;
    return OWNERSHIP.every((own) => {
      const u = base(Object.assign({ still_own_property: own }, unknownWindow));
      q.onSet(u, "unsure");
      const a = base(Object.assign({ still_own_property: own }, unknownWindow));
      return !("return_in_time" in u)
        && face(CASH.computeCashBenefit(u, 100000, 140000, () => {})) === face(CASH.computeCashBenefit(a, 100000, 140000, () => {}));
    });
  }));

check("R14", "and in all five flows \"in time\" and \"out of time\" still store true and false", () =>
  SECTORS.every((sec) => {
    const q = fallbackQ(sec);
    if (!q) return false;
    const y = {}, n = {};
    q.onSet(y, "yes"); q.onSet(n, "no");
    return y.return_in_time === true && n.return_in_time === false;
  }));

check("R15", "a window not known and not answered: no route, no cash figure, a reason saying it is not yet confirmed, and none saying it has closed", () =>
  OWNERSHIP.every((own) => {
    const r = run(Object.assign({ still_own_property: own }, unknownWindow));
    return r.route === null && r.mechanism === null && r.cash[0] === null && r.cash[1] === null
      && r.reasons.some((x) => /still open (to amendment )?is not yet confirmed/.test(x))
      && !r.reasons.some((x) => /has closed/.test(x));
  }));

check("R16", "a window KNOWN to be closed on a sold property is still W3, and still says it has closed", () => {
  const r = run({ still_own_property: "no", return_in_time: false });
  return r.route === "W3" && r.reasons.some((x) => /has closed/.test(x));
});

const TODAY = new Date("2026-09-13T00:00:00Z");
check("R17", "the year the money was spent in decides: a completion date years before the year end given closes a window that year end alone would open", () => {
  const given = { claimant_type: "company", accounting_period_end: "2026-03-31" };
  const alone = CASH.deriveAmendmentWindow(Object.assign({}, given), TODAY);
  const spent = CASH.deriveAmendmentWindow(Object.assign({ event_date: "2021-06-01" }, given), TODAY);
  return alone.known === true && alone.inTime === true
    && spent.known === true && spent.inTime === false
    && spent.periodEnd === "2022-03-31" && spent.basis === "period_of_spend";
});

const windowMatrix = [];
for (const who of ["company", "individual"])
  for (const ape of ["2019-03-31", "2023-12-31", "2026-03-31", "2027-06-30"])
    for (const spend of ["2015-05-01", "2020-01-15", "2023-12-31", "2024-01-01", "2025-09-30", "2026-08-01", "2028-02-29"])
      for (const today of ["2021-01-01", "2024-06-30", "2026-09-13", "2029-03-31"])
        windowMatrix.push({ s: { claimant_type: who, accounting_period_end: ape, event_date: spend }, today: new Date(today + "T00:00:00Z") });
check("R18", "over " + windowMatrix.length + " states, with the switch off the year of spend never opens a window the year end given had closed", () =>
  windowMatrix.every(({ s, today }) => {
    const alone = CASH.deriveAmendmentWindow({ claimant_type: s.claimant_type, accounting_period_end: s.accounting_period_end }, today);
    const spent = CASH.deriveAmendmentWindow(Object.assign({}, s), today);
    return !(alone.known && !alone.inTime && spent.known && spent.inTime);
  }));

if (OLDER) {
  const OLD = loadCash(OLDER);
  const keyOf = (obj, v) => (v === null ? null : Object.keys(obj).find((k) => obj[k] === v) || "?");
  let first = "";
  check("EQV1", "over " + matrix.length + " states: cash, reasons and refund unchanged, and mechanism is the old route's key", () =>
    matrix.every((s) => {
      const a = OLD.computeCashBenefit(Object.assign({}, s), 100000, 140000, () => {});
      const b = CASH.computeCashBenefit(Object.assign({}, s), 100000, 140000, () => {});
      const same = JSON.stringify(a.cash) === JSON.stringify(b.cash)
        && JSON.stringify(a.reasons) === JSON.stringify(b.reasons)
        && a.refundEligible === b.refundEligible
        && keyOf(OLD.ROUTE, a.route) === keyOf(CASH.MECHANISM, b.mechanism);
      if (!same && !first) first = JSON.stringify(s);
      return same;
    }));
  if (first) results[results.length - 1].name += " - first difference at " + first;
}

const moved = [];
if (MOVES) {
  const OLD = loadCash(MOVES);
  const windowClosed = (s) => {
    const w = CASH.deriveAmendmentWindow(s);
    return w.known ? !w.inTime : s.return_in_time === false;
  };
  for (const s of matrix) {
    const a = cashOf(OLD, s), b = cashOf(CASH, s);
    if (JSON.stringify(a.cash) !== JSON.stringify(b.cash) || a.route !== b.route || a.refundEligible !== b.refundEligible)
      moved.push({ s, a, b });
  }
  let firstUp = "", firstUnnamed = "";
  check("M1", "every move is downward: a cash figure only to NO figure, a refund only to no refund, a route only to no route", () =>
    moved.every(({ s, a, b }) => {
      const cashSame = JSON.stringify(a.cash) === JSON.stringify(b.cash);
      const cashDown = a.cash[0] !== null && b.cash[0] === null && b.cash[1] === null;
      const refundOk = a.refundEligible === b.refundEligible || (a.refundEligible === true && b.refundEligible === false);
      const routeOk = a.route === b.route || b.route === null;
      const ok = (cashSame || cashDown) && refundOk && routeOk;
      if (!ok && !firstUp) firstUp = JSON.stringify(s);
      return ok;
    }));
  if (firstUp) results[results.length - 1].name += " - first exception at " + firstUp;
  check("M2", "every moved state is one Phase 129 names (" + moved.length + " of " + matrix.length + " states moved)", () =>
    moved.every(({ s, a }) => {
      const ownUnknown = s.still_own_property !== "yes" && s.still_own_property !== "no";
      const lossOffRoute = s.claim_creates_loss === "yes" && a.mechanism === "loss_carryback"
        && a.route !== "W1" && a.route !== "W2";
      const ok = (ownUnknown && windowClosed(s)) || lossOffRoute;
      if (!ok && !firstUnnamed) firstUnnamed = JSON.stringify(s);
      return ok;
    }));
  if (firstUnnamed) results[results.length - 1].name += " - first unnamed move at " + firstUnnamed;

  /* PHASE 132, 14 September 2026 - A PARTNERSHIP WITH A COMPANY PARTNER (TMA
     1970 s.12ABA(4)(b), s.12AA(5B)). Its own matrix, because the one above has
     no partnership in it. Period ends 2024-12-31 (company date earlier),
     2024-03-31 and 2024-02-29 (later), 2024-01-31 (the same), and a run of
     period ends about two years before today, so that today falls between the
     two dates for some. A move may go from a refund to none, from a figure to
     none, and from a route to a slower one - W1 to W2, W3 or none, W2 to W3 or
     none - and never the other way. */
  const RANK = { W1: 2, W2: 1, W3: 0 };
  const rank = (r) => (r === null || r === undefined) ? 0 : (RANK[r] === undefined ? 3 : RANK[r]);
  const partnershipMatrix = [];
  const pes = ["2024-12-31", "2024-03-31", "2024-02-29", "2024-01-31"];
  for (let k = 690; k <= 800; k += 5) pes.push(new Date(Date.now() - k * 86400000).toISOString().slice(0, 10));
  for (const who of ["partnership", "llp"])
    for (const member of [true, false, undefined])
      for (const ape of pes)
        for (const own of ["yes", "no", undefined])
          for (const rit of [true, false, undefined])
            partnershipMatrix.push(base({ claimant_type: who, accounting_period_end: ape, still_own_property: own,
              return_in_time: rit, partnership_has_company_member: member }));
  const pMoved = [];
  for (const s of partnershipMatrix) {
    const a = cashOf(OLD, s), b = cashOf(CASH, s);
    if (JSON.stringify(a.cash) !== JSON.stringify(b.cash) || a.route !== b.route || a.refundEligible !== b.refundEligible)
      pMoved.push({ s, a, b });
  }
  let firstPUp = "";
  check("M3", "Phase 132: over " + partnershipMatrix.length + " partnership and LLP states, every move is downward (" + pMoved.length + " moved)", () =>
    pMoved.every(({ s, a, b }) => {
      const cashOk = JSON.stringify(a.cash) === JSON.stringify(b.cash) || (b.cash[0] === null && b.cash[1] === null);
      const refundOk = a.refundEligible === b.refundEligible || (a.refundEligible === true && b.refundEligible === false);
      const routeOk = a.route === b.route || rank(b.route) < rank(a.route);
      const ok = cashOk && refundOk && routeOk;
      if (!ok && !firstPUp) firstPUp = JSON.stringify(s);
      return ok;
    }));
  if (firstPUp) results[results.length - 1].name += " - first exception at " + firstPUp;
  pMoved.forEach((m) => moved.push(m));
}

console.log("THE CASH ROUTE PROOF");
console.log("  site file: " + SITE + (OLDER ? "\n  compared with: " + OLDER : "") + (MOVES ? "\n  moves from: " + MOVES : ""));
for (const r of results) console.log("  " + (r.ok ? "HOLDS " : "FAILS ") + r.id + "  " + r.name);
if (MOVES) {
  const classes = {};
  for (const { s, a, b } of moved) {
    const own = s.still_own_property === undefined ? "ownership absent" : "ownership " + JSON.stringify(s.still_own_property);
    const who = (s.claimant_type === "partnership" || s.claimant_type === "llp")
      ? s.claimant_type + ", company partner " + (s.partnership_has_company_member === undefined ? "not known" : JSON.stringify(s.partnership_has_company_member)) + ", " : "";
    const k = who + own + ", old route " + a.route + " / " + a.mechanism + (s.claim_creates_loss ? ", loss carried back" : "")
      + "  ->  new route " + b.route + " / " + b.mechanism;
    classes[k] = (classes[k] || 0) + 1;
  }
  console.log("\n  WHICH FIGURES MOVED (cash figure withheld where one used to stand), by class:");
  const keys = Object.keys(classes).sort();
  if (keys.length === 0) console.log("    none");
  for (const k of keys) console.log("    " + String(classes[k]).padStart(4) + "  " + k);
}
const bad = results.filter((r) => !r.ok);
console.log(bad.length === 0
  ? "\nGREEN: every check holds (" + results.length + " of " + results.length + ")."
  : "\nRED: " + bad.length + " of " + results.length + " checks do not hold.");
process.exit(bad.length === 0 ? 0 : 1);

/* =============================================================================
   THE SELF-TEST - runs this file as a child, four times, and reads what it did.
   ============================================================================= */
function selfTest() {
  const me = __filename;
  const runMe = (args) => spawnSync(process.execPath, [me, "--against", SITE].concat(args), { encoding: "utf8" });
  if (!fs.existsSync(SITE)) cannot("the self-test needs the site file: " + SITE + " is not there");
  if (!fs.existsSync(PRE_RELABEL)) {
    cannot("the self-test needs a copy of the site file from before the relabel, and " + PRE_RELABEL +
      " is not there - pass one with --pre-relabel \"<file>\"");
  }
  const cases = [];
  const refused = (r) => r.status === 2 && r.stderr.indexOf(RELABEL_REFUSAL) !== -1 && !/\bRED\b/.test(r.stdout);

  let r = runMe(["--equivalent-to", SITE]);
  cases.push(["S1", "the site file compared with itself is REFUSED - exit 2, the plain sentence, and no RED line", refused(r),
    "exit " + r.status]);

  const tmp = path.join(os.tmpdir(), "caprebate-cash-proof-self-test-" + process.pid + ".html");
  let r2;
  try {
    fs.copyFileSync(SITE, tmp);
    r2 = spawnSync(process.execPath, [me, "--against", tmp, "--equivalent-to", tmp], { encoding: "utf8" });
  } finally { try { fs.unlinkSync(tmp); } catch (e) { /* already gone */ } }
  cases.push(["S2", "a byte copy compared with itself is REFUSED the same way", refused(r2), "exit " + r2.status]);

  r = runMe(["--equivalent-to", PRE_RELABEL]);
  cases.push(["S3", "a copy from before the relabel is NOT refused: EQV1 runs and reports (" + path.basename(PRE_RELABEL) + ")",
    r.status !== 2 && /\b(HOLDS|FAILS) EQV1\b/.test(r.stdout) && r.stderr.indexOf(RELABEL_REFUSAL) === -1, "exit " + r.status]);

  r = runMe(["--equivalent-to", path.join(os.tmpdir(), "caprebate-no-such-site-" + process.pid + ".html")]);
  cases.push(["S4", "a file that is not there is COULD NOT RUN, not the relabel refusal",
    r.status === 2 && /COULD NOT RUN/.test(r.stderr) && r.stderr.indexOf(RELABEL_REFUSAL) === -1, "exit " + r.status]);

  console.log("THE CASH ROUTE PROOF - SELF-TEST");
  console.log("  site file: " + SITE + "\n  pre-relabel copy: " + PRE_RELABEL);
  for (const [id, name, ok, note] of cases) console.log("  " + (ok ? "HOLDS " : "FAILS ") + id + "  " + name + (ok ? "" : " - " + note));
  const failed = cases.filter((c) => !c[2]);
  console.log(failed.length === 0
    ? "\nGREEN: the refusal holds where it must and stays out of the way where it must not (" + cases.length + " of " + cases.length + ")."
    : "\nRED: " + failed.length + " of " + cases.length + " self-test cases do not hold.");
  process.exit(failed.length === 0 ? 0 : 1);
}
