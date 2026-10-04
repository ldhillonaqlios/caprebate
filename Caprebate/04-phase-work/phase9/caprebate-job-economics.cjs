/* =============================================================================
   CAPREBATE — JOB ECONOMICS (Phase 9)

   Board 18422317809. Item 12955448913, "Cost the small end — where a desk-only
   claim stops paying for itself".

   ---------------------------------------------------------------------------
   READ THIS FIRST: THIS IS NOT caprebate-cost-model.cjs, AND THE NAMES ARE A TRAP

   There are now two files in this folder with "cost" in their subject and they
   cost COMPLETELY DIFFERENT THINGS:

     caprebate-cost-model.cjs   costs the CLIENT'S BUILDING. It is the residual
                                replacement-cost model that sizes the client's
                                capital allowances claim. Its "cost" is
                                construction cost, in the client's building, on
                                the client's side of the invoice.

     THIS FILE                  costs OUR JOB. What Caprebate spends to produce
                                one claim, what one claim earns us, and the
                                allowances figure below which producing it
                                loses money.

   A phase that conflates them will produce nonsense that type-checks. If you are
   about to add a "cost" function, say whose cost in the first line of its
   comment. That is why this file is called job-economics and not cost-model-2.

   ---------------------------------------------------------------------------
   WHAT THE DECISION COMMITTED US TO, AND WHY THIS EXISTS

   On 1 September 2026 Lakhbir decided there is NO MINIMUM JOB SIZE. The smallest
   job is a £0 purchase price and the fee is a set percentage of the allowances
   identified. That answer closed a question and opened a larger one: with no
   floor, the desk-only route has to carry the small end on its own.

   The surveyor call agenda (§1A.2, phase9) already states the consequence in
   terms and it is the sentence this module quantifies:

     "no-minimum plus desktop-only commits us to desk-only working on small
      jobs, with no visit to fall back on."

   ---------------------------------------------------------------------------
   WHAT ALREADY EXISTED, BECAUSE THE PHASE PROMPT SAID NOTHING DID

   The Phase 100 prompt asserted "THERE IS NO PER-JOB COST MODEL ANYWHERE" and
   "nothing computes what one job costs to produce". Re-derived 8 September 2026,
   that is not quite right and the correction matters:

     - 03-app/caprebate-business-plan-model.cjs DOES compute a cost per job. It
       holds DIRECT[sector] = {surveyor, cta, hours, rate, data}, an overhead
       loading and a failed-enquiry drag, and prints a section headed
       "2. COST PER JOB". Those constants are the real cost base and THIS FILE
       DOES NOT INVENT A SECOND ONE — see SECTOR_DIRECT below, which restates
       them and is held to them by test.

     - What genuinely did not exist is a ROUTE. That model charges a full
       surveyor cost on every job in every sector. It has no notion of desk-only
       versus a site visit, no break-even, no routing rule and no connection to
       the fee guard. Zero occurrences of "scenario" in the file.

     - The published paper "Minimum fee — the research" (item 12830205390,
       28 August 2026) DOES carry per-job figures for three delivery scenarios.
       But it says those came from re-running the business plan model "with the
       automation parameters changed", AND THAT VARIATION WAS NEVER COMMITTED.
       So the paper's numbers could not be re-derived by running anything. That
       is the actual gap, and reproducePublishedPaper() below closes it: the
       paper's tables are now regenerated from code and asserted by test.

   ---------------------------------------------------------------------------
   TWO ROUTES, AND WHY THIS FILE REFUSES TO PICK ONE

   Which route a job needs depends on a question the surveyor has not been asked:
   "where does a desk estimate stop being defensible — is there a size, a
   complexity, or a category of plant above which somebody has to attend?"
   (surveyor-call-agenda.md §1A.1). It is a professional judgement about the
   surveyor's own liability, not a commercial preference of ours; Lakhbir's
   answer of "yes — a desktop survey" is on record as the commercial preference
   and is expressly NOT an answer to it.

   So every function here takes the route as an ARGUMENT and there is no default.
   routeDecision() reports what each route implies and REFUSES to name a winner
   while DESK_DEFENSIBILITY_ANSWERED is false. A model that assumes one route
   answers a question the surveyor has not been asked.

   ---------------------------------------------------------------------------
   THE RULE THIS FILE OBEYS, AND IT IS THE SAME ONE AS EVERYWHERE ELSE

   NO RATE IS RESTATED HERE. The fee rate belongs to CB_FEE in the shipped
   engine (a flat 3% of allowances identified: the basis is Q55, Phase 74; the
   3% is Lakhbir's answer read 15 September 2026, built by Phase 132e). Sector yield bands belong
   to Rulebook I. Tax rates belong to CB_RATES and the benefit model to
   CB_BENEFIT. Every one of them is INJECTED. Pass the wrong one and the
   arithmetic is wrong; that is deliberate, because the alternative is a second
   copy of a rate that drifts silently. The test file reads them out of the
   shipped engine and asserts they agree.

   UNKNOWN IS NOT A BRANCH. A parameter with no value NEVER becomes 0, a
   midpoint, or a pass. Read PARAMS.homedata_cost_per_lookup below: while it
   was null, reading it through cost functions yielded a result flagged
   known:false, and nothing silently treated a missing cost as a free one.
   (Updated 28 September 2026, Phase 153: since Phase 151, 24 September 2026,
   it is 0.08 - Homedata's 8p list price, not a price on an account - and
   homedata_cost_per_lookup_basis says so in every result that reads it. The
   reader still returns known:false for a value that is not a number. The
   rule still shows in PARAMS.overhead_per_year and
   PARAMS.surveyor_review_and_sign_quote, which are null.)

   RUN THE TESTS
     node --test caprebate-job-economics.test.cjs
   ============================================================================= */

"use strict";

/* ----------------------------------------------------------------- errors -- */

class JobEconError extends Error {
  constructor(code, message, detail) {
    super(message);
    this.name = "JobEconError";
    this.code = code;
    this.detail = detail || {};
  }
}
const fail = (code, message, detail) => { throw new JobEconError(code, message, detail); };

const isNum = v => typeof v === "number" && isFinite(v);
const pos   = v => isNum(v) && v > 0;

/* =============================================================================
   1. THE COST BASE

   These are NOT new numbers. They are 03-app/caprebate-business-plan-model.cjs
   lines 24-27 verbatim, and caprebate-job-economics.test.cjs parses that file
   and asserts the two agree. If you change one, the test fails until you change
   the other. That is the whole point of duplicating them rather than requiring
   across the tree: the business plan model is a SCRIPT that prints a report on
   require, so it cannot be imported without running it.

   THEY ARE ESTIMATES, NOT QUOTES. No surveyor or CTA quote existed as at
   8 September 2026 and the published research names this as its weakest input.
   ============================================================================= */

/* PHASE 153b, 4 October 2026 (Word question 191, Lakhbir's: "Should our job cost model still count a tax adviser's
   review on every surveyor job?"). The `cta` line is RENAMED, NOT CHANGED: under clause 1 of the engagement letter
   the client's own accountant or adviser signs the tax position, and we pay a tax adviser only if we introduce one
   (switched off). So the line is "our own tax adviser, if we introduce one" - LINE_NAMES below - kept on every
   surveyor job as a safety margin until ten real jobs show how often a client asks us for one; then cta_share is set
   to that share. Every figure is unchanged, and the key stays `cta` because the business plan model and the agreement
   test read it by that name. */
const LINE_NAMES = Object.freeze({
  surveyor: "Surveyor",
  cta: "Our own tax adviser, if we introduce one",
  internal: "Our own time",
  data: "Data and lookups"
});

const SECTOR_DIRECT = {
  dental:           { surveyor: 1500, cta: 600,  hours: 8,  rate: 60, data: 50 },
  gp:               { surveyor: 2200, cta: 900,  hours: 12, rate: 60, data: 50 },
  care_home:        { surveyor: 3200, cta: 1200, hours: 14, rate: 60, data: 50 },
  private_hospital: { surveyor: 3500, cta: 1300, hours: 15, rate: 60, data: 50 }
};

const SECTORS = Object.keys(SECTOR_DIRECT);

/* =============================================================================
   2. THE ROUTES

   SURVEYOR_VISIT and DESK_ONLY are the two the phase asks for. STRAIGHT_THROUGH
   is carried because the published paper prices it and dropping it would make
   this module contradict a document on the board — but it is NOT a third
   candidate for routing today and priceable() says so.

   HOW A ROUTE MODIFIES THE COST BASE. Each route describes what happens to the
   four direct-cost lines and to the failed-enquiry drag. Where a route sets an
   ABSOLUTE surveyor cost rather than a factor, that is flagged, because it is a
   finding rather than a modelling convenience — see SECTOR_INVARIANT_SURVEYOR.
   ============================================================================= */

const ROUTES = {

  /* S1 in the published paper. What we will actually be running on day one:
     the desktop pack's judgement sections are deliberately empty pending a
     surveyor's correction pass, so a surveyor produces the valuation. */
  SURVEYOR_VISIT: {
    id: "SURVEYOR_VISIT",
    paper_scenario: "S1",
    label: "Surveyor engaged to produce the valuation, attending the property",
    surveyor_factor: 1,          /* full sector surveyor cost */
    surveyor_absolute: null,
    cta_share: 1,                /* our own tax adviser, if we introduce one, on every job - a safety margin (Phase 153b) */
    hours_factor: 1,
    hours_absolute: null,
    fail_hours: 2,
    priceable: true,
    note: "The delivery model the build currently describes."
  },

  /* S2. The stated ambition: the desktop pack is complete and defensible enough
     that the surveyor's role compresses from "produce the valuation" to "read
     it, challenge it, sign it". Costed at 2-3 hours of specialist surveying
     time; published UK guidance puts chartered surveyor rates for specialist
     work at £100-£250/hr and £600 is the mid of that range at 2-3 hours. */
  DESK_ONLY: {
    id: "DESK_ONLY",
    paper_scenario: "S2",
    label: "Desk-produced pack, surveyor reviews and signs without attending",
    surveyor_factor: null,
    surveyor_absolute: 600,      /* SECTOR-INVARIANT — see the finding below */
    cta_share: 0.25,             /* exception-only, one job in four */
    hours_factor: 0.5,           /* the pack is generated, not assembled */
    hours_absolute: null,
    fail_hours: 1,
    priceable: true,
    note: "Requires the surveyor's defensibility answer before it can be routed to."
  },

  /* S3. No professional engaged per job at all. Retained because the paper
     prices it; NOT priceable, for four reasons that are not software problems
     (who signs the valuation; whether PI cover reaches it; clawback exposure
     that does not scale down with the fee; and an engine gate that must refuse
     to route a case straight through when any exclusion is present). */
  STRAIGHT_THROUGH: {
    id: "STRAIGHT_THROUGH",
    paper_scenario: "S3",
    label: "No professional engaged per job; surveyor on a 1-in-10 audit retainer",
    surveyor_factor: null,
    surveyor_absolute: 60,       /* 1-in-10 of the £600 review-and-sign */
    cta_share: 0.05,             /* one job in twenty */
    hours_factor: null,
    hours_absolute: 1,
    fail_hours: 0.25,
    priceable: false,
    note: "Cannot be priced today: four non-software preconditions are open."
  }
};

/* ---------------------------------------------------------------------------
   FINDING — THE DESK-ONLY ROUTE HAS NO SECTOR-VARYING COST BASIS.

   SURVEYOR_VISIT costs £1,500 for dental and £3,500 for a private hospital: a
   2.3x spread. DESK_ONLY costs £600 for both. That is not a modelling choice
   made here — it is what the published paper does, and the paper is explicit
   that "dental is used as the reference sector throughout".

   The risk is that the paper's S2 tables are read as general when they are a
   dental number. A private hospital desk review is not the same two to three
   hours as a dental one, and if desk review scales with the building the way a
   visit does, every DESK_ONLY figure for the three larger sectors is too low
   and the break-evens below are too optimistic for exactly the sectors where
   the jobs are biggest.

   THIS IS NOT FIXED HERE, because fixing it means inventing a sector scaling
   nobody has measured. It is flagged, it is asserted by test, and it is a
   question for the surveyor. Raised as Q92.
   --------------------------------------------------------------------------- */
const SECTOR_INVARIANT_SURVEYOR = {
  applies_to: ["DESK_ONLY", "STRAIGHT_THROUGH"],
  is_a_finding: true,
  question: "Does a desk review-and-sign scale with the size of the building the "+
            "way a site visit does? If it does, every desk-only figure for GP, "+
            "care home and private hospital is too low.",
  raised_as: "Q92"
};

/* =============================================================================
   3. NAMED PARAMETERS WITH NO VALUE

   Every one of these is a number nobody has. They are named so that the shape
   of the model is complete and the missing input is visible, and they are null
   so that nothing can quietly consume a guess.

   THE RULE: null NEVER BECOMES ZERO. A function that needs one of these returns
   {known:false, ...} naming the parameter. It does not throw, because the rest
   of the model is still useful without it, and it does not default, because a
   defaulted cost is a fabricated one.
   ============================================================================= */

const PARAMS = {

  /* ------------------------------------------------------------------------
     THE ADDRESS LOOKUP (Homedata). A COST OF A SIGNED JOB, ONCE PER PROPERTY.

     REWRITTEN 24 SEPTEMBER 2026 BY PHASE 147. Until then this comment, the
     function that reads it and section 6 of the .md modelled the lookup as the
     one cost spent BEFORE a client signs: fired per property on every enquiry,
     charged four times over to the one enquiry in four that converts, and
     offered as a reason to cap the property count on the free tier. Lakhbir's
     rule of 4 September 2026 ended that premise, and the 17 September note that
     said so left the code beneath it untouched. The old text is in
     caprebate-job-economics.cjs.bak-phase147.

     WHEN IT IS SPENT. A paid call fires only after the engagement letter is
     signed (assertSignedEngagement, server side) and a member of staff clicks
     Run the research. The connector that spends it is built and switched off:
     09-app/backend/src/connectors/homedata.ts (Phase 146d). So an enquiry that
     never signs cannot have cost a lookup, and this is a direct cost of a job
     that has landed, beside the £50 data line. It is NOT a loading on the
     enquiries that failed, and nothing here charges it to them.

     WHAT OUR LOOKUP COSTS: 8 tokens, 8p a property - 2 for the postcode search,
     5 for the address, 1 for the title pre-check. The connector computes it
     (homedataCostPence()) from the price list read on 23 September 2026. The
     SUPPLIER'S find-then-retrieve is 7 tokens, 7p; that is not what we call.

     SET TO THE LIST PRICE, 24 SEPTEMBER 2026 (Phase 151). Lakhbir called the
     price nominal (Word answer 35, closed that day), so the 8p list price now
     stands as the value, MARKED AS A LIST PRICE in
     homedata_cost_per_lookup_basis and in every result that reads it. It is
     still not a price on an account: the first top-up and the first real
     lookup's X-Call-Weight confirm it or correct it. The paragraph below is
     how the blank was explained until then.

     WHY IT STAYED NULL - and the reason is the thing that changed, not the blank.
     Not because the lookup might fire before signature: it cannot. And no
     longer because nobody has decided to buy one: Lakhbir answered "yes, use
     Homedata" on 22 September 2026 (Word question 36, "Do we need a paid
     address lookup at launch, or just use the typed address?"). It stays null
     because 8p is a LIST PRICE read off a web page, not a price on an account:
     no account is open, no token has been bought, and the price question (Word
     question 35, "How much does a Homedata address lookup cost us each time?")
     carries an unsigned answer. The value goes in when the first top-up and the
     first real lookup's X-Call-Weight confirm it. Until then it is unknown, and
     unknown is not zero. Suite D pins null and proves the two differ.
     ------------------------------------------------------------------------ */
  homedata_cost_per_lookup: 0.08,
  /* What the figure above is. "list price" until an account confirms it. */
  homedata_cost_per_lookup_basis: "list price: 8 tokens at Homedata's published 100 tokens = GBP 1, read 23 September 2026; not a price on an account",

  /* The real overhead. £60,000 is the placeholder inherited from the Phase 1
     options paper and named there as a placeholder. It contains no founder
     salary. Both readings are modelled; neither is asserted as the truth. */
  overhead_per_year: null,

  /* A real surveyor quote for a review-and-sign engagement, distinct from a
     full survey. The published research calls this "the single biggest lever
     in the paper" and "the number to get first". £600 is a mid-range estimate
     from published guidance, not a quote. */
  surveyor_review_and_sign_quote: null,

  /* Whether a surveyor will sign a pack for a property they have not visited,
     and if so within what bounds. Until this is answered DESK_ONLY is a costing
     exercise, not a route. */
  desk_defensibility_answer: null
};

/* Does the surveyor's answer exist? Everything that would ROUTE a job rather
   than merely cost it is gated on this. */
const DESK_DEFENSIBILITY_ANSWERED = PARAMS.desk_defensibility_answer !== null;

/* The modelling defaults actually used when a caller supplies nothing. These
   are the published paper's inputs, carried so this file reproduces it. They
   are NOT claims about the world. */
const MODELLING = {
  overhead_per_year_placeholder: 60000,
  founder_salary: 60000,
  conversion_rate: 0.25,        /* one enquiry in four */
  fail_rate_per_hour: 60,
  target_margin: 0.25
};

/* =============================================================================
   4. COST PER JOB
   ============================================================================= */

function route(id) {
  const r = ROUTES[id];
  if (!r) fail("E_UNKNOWN_ROUTE", "no such route: " + id,
               { given: id, known: Object.keys(ROUTES) });
  return r;
}

function sector(id) {
  const s = SECTOR_DIRECT[id];
  if (!s) fail("E_UNKNOWN_SECTOR", "no such sector: " + id,
               { given: id, known: SECTORS });
  return s;
}

/* What the surveyor line costs on this route, in this sector. */
function surveyorCost(sectorId, routeId) {
  const s = sector(sectorId), r = route(routeId);
  if (r.surveyor_absolute !== null) return r.surveyor_absolute;
  return s.surveyor * r.surveyor_factor;
}

/* What the "our own tax adviser, if we introduce one" line costs (LINE_NAMES.cta). cta_share is the proportion of jobs
   that adviser reads. */
function ctaCost(sectorId, routeId) {
  const s = sector(sectorId), r = route(routeId);
  return s.cta * r.cta_share;
}

/* Internal time. */
function internalCost(sectorId, routeId) {
  const s = sector(sectorId), r = route(routeId);
  const hours = r.hours_absolute !== null ? r.hours_absolute : s.hours * r.hours_factor;
  return hours * s.rate;
}

/* Direct cost — what one job costs in things we buy or spend for that job.
   EXCLUDES the failed-enquiry drag, which is a loading, not a direct cost. */
function directCost(sectorId, routeId) {
  const s = sector(sectorId);
  return surveyorCost(sectorId, routeId)
       + ctaCost(sectorId, routeId)
       + internalCost(sectorId, routeId)
       + s.data;
}

/* The failed-enquiry drag. Three enquiries fail for every one that converts, at
   fail_hours of desk time each, loaded onto the job that lands.

   This is itself an automation variable and it is easy to miss: at S1 it is
   £360, which is more than the ENTIRE delivery cost at S3. */
function failedEnquiryDrag(routeId, opts) {
  const o = opts || {};
  const r = route(routeId);
  const conv = isNum(o.conversionRate) ? o.conversionRate : MODELLING.conversion_rate;
  if (!pos(conv) || conv > 1) {
    fail("E_BAD_CONVERSION", "conversion rate must be in (0,1]", { given: conv });
  }
  const rate = isNum(o.failRate) ? o.failRate : MODELLING.fail_rate_per_hour;
  return ((1 / conv) - 1) * r.fail_hours * rate;
}

/* Overhead per job at a given annual volume. */
function overheadPerJob(jobsPerYear, opts) {
  const o = opts || {};
  if (!pos(jobsPerYear)) {
    fail("E_BAD_VOLUME", "jobs per year must be positive", { given: jobsPerYear });
  }
  const base = isNum(o.overheadPerYear) ? o.overheadPerYear
             : MODELLING.overhead_per_year_placeholder;
  const salary = o.includeFounderSalary ? MODELLING.founder_salary : 0;
  return (base + salary) / jobsPerYear;
}

/* -----------------------------------------------------------------------------
   LOADED COST — the number that decides whether a job pays.

   loaded = direct + overhead/job + failed-enquiry drag

   opts:
     conversionRate         default 1-in-4
     overheadPerYear        default the £60,000 PLACEHOLDER
     includeFounderSalary   default false; true adds £60,000
     properties             property count of the signed job, for the lookup
     homedataCostPerLookup  supply to model it; omit and it stays unknown
   --------------------------------------------------------------------------- */
function loadedCost(sectorId, routeId, jobsPerYear, opts) {
  const o = opts || {};
  const direct = directCost(sectorId, routeId);
  const drag = failedEnquiryDrag(routeId, o);
  const oh = overheadPerJob(jobsPerYear, o);
  const lookup = addressLookupCost(o);

  return {
    sector: sectorId,
    route: routeId,
    jobs_per_year: jobsPerYear,

    surveyor: surveyorCost(sectorId, routeId),
    cta: ctaCost(sectorId, routeId),
    internal: internalCost(sectorId, routeId),
    data: sector(sectorId).data,

    direct: direct,
    failed_enquiry_drag: drag,
    overhead_per_job: oh,
    marginal: direct + drag,

    /* The headline. Complete EXCEPT for the address lookup, which is
       reported separately and flagged rather than folded in silently. */
    loaded: direct + drag + oh,

    /* Never added into `loaded` while it is unknown. When it IS known the
       caller gets loaded_including_address_lookup and can use it. It is added
       once per property of THIS job - never through the failed-enquiry drag,
       because an enquiry that did not sign cannot have spent it. */
    address_lookup: lookup,
    loaded_including_address_lookup: lookup.known ? direct + drag + oh + lookup.cost : null,

    includes_founder_salary: !!o.includeFounderSalary,
    overhead_basis: isNum(o.overheadPerYear) ? o.overheadPerYear
                    : MODELLING.overhead_per_year_placeholder,
    overhead_is_placeholder: !isNum(o.overheadPerYear)
  };
}

/* -----------------------------------------------------------------------------
   THE ADDRESS LOOKUP — the Homedata line. Whose cost: OURS, on a SIGNED job.

   Was preSignatureCost() until 24 September 2026 (Phase 147). The name and its
   explanation asserted a cost spent before a client signs, which Lakhbir's rule
   of 4 September 2026 makes impossible; see PARAMS.homedata_cost_per_lookup.

   cost_per_conversion WAS REMOVED, NOT RELABELLED. It divided the lookup by the
   conversion rate to charge it to the three enquiries in four that fail - four
   times the truth, for enquiries that cannot have cost a lookup. It was not
   kept as a what-if for a world where the gate moves: that world is a decision
   nobody has taken and the 4 September rule forbids, a figure that exists gets
   quoted, and if the rule ever changes the cost is re-modelled from the rule
   as then written, not from a number kept warm here. Suite D asserts it is gone.

   Returns known:false when the per-lookup price is not supplied. It does NOT
   return 0 and it does NOT throw. Unknown is not a branch: a caller that reads
   .cost without checking .known gets undefined, not a free lookup.
   --------------------------------------------------------------------------- */
function addressLookupCost(opts) {
  const o = opts || {};
  const properties = isNum(o.properties) ? o.properties : 1;
  if (!pos(properties) || properties !== Math.floor(properties)) {
    fail("E_BAD_PROPERTY_COUNT", "property count must be a positive integer",
         { given: o.properties });
  }

  const supplied = isNum(o.homedataCostPerLookup);
  const per = supplied ? o.homedataCostPerLookup : PARAMS.homedata_cost_per_lookup;
  /* Phase 151: say which it is - a figure the caller supplied, or the list price. */
  const basis = supplied ? "supplied" : PARAMS.homedata_cost_per_lookup_basis;

  const when = "after the engagement letter is signed, when a member of staff "+
               "clicks Run the research: once per property of the signed job";

  if (!isNum(per)) {
    return {
      known: false,
      parameter: "homedata_cost_per_lookup",
      properties: properties,
      lookups: properties,
      when: when,
      why: "what one address lookup costs us is not confirmed. Our lookup is "+
           "8 tokens (8p) at Homedata's list price read 23 September 2026, but "+
           "no account is open and no lookup has been bought, so the price is "+
           "unknown rather than zero. See the Word question \"How much does a "+
           "Homedata address lookup cost us each time?\".",
      /* deliberately absent: cost */
    };
  }

  return {
    known: true,
    parameter: "homedata_cost_per_lookup",
    per_lookup: per,
    basis: basis,
    properties: properties,
    lookups: properties,
    when: when,
    cost: per * properties
  };
}

/* =============================================================================
   5. WHERE EACH ROUTE STOPS PAYING FOR ITSELF

   The fee is a percentage of ALLOWANCES IDENTIFIED (Q55, Phase 74, and
   CB_FEE.RATE in the shipped engine). So the allowances figure at which a route
   breaks even is simply:

       break-even allowances = loaded cost / fee rate

   THE FEE RATE IS NOT DEFINED IN THIS FILE. Pass it. The test reads CB_FEE.RATE
   out of the shipped engine and asserts the two agree, so this cannot drift
   away from what we actually charge.

   ---------------------------------------------------------------------------
   AND A WARNING ABOUT THE PUBLISHED BREAK-EVEN PURCHASE PRICES.

   "Minimum fee — the research" (28 August 2026) reports break-even purchase
   prices of £797,778 (S1), £404,444 (S2) and £187,778 (S3) for dental at
   100 jobs/year. Those are correct ON THE BASIS THAT PAPER USED — 5% of
   LIFETIME RELIEF. The basis was changed on 3 September 2026 (Q55, Phase 74) to
   5% of ALLOWANCES IDENTIFIED, which is larger by a factor of 1/tax_rate, and
   the rate was changed on 15 September 2026 (Phase 132e) to a flat 3%.

   At 5% of allowances the smallest dental job that paid for itself on the
   surveyor-visit route at 100 jobs a year was about £319,000 of purchase
   price. At 3% it is about £532,000 (and about £517,000 at the 120 jobs a year
   Lakhbir gave for the engagement gate). Both are still well below the
   paper's £798,000, which was a lifetime-relief figure.

   breakEvenPurchasePrice() below computes it on the CURRENT basis and
   reportsBasisChange() states the comparison, so nobody re-publishes the old
   number from memory.
   ============================================================================= */

function breakEvenAllowances(sectorId, routeId, jobsPerYear, feeRate, opts) {
  const o = opts || {};
  if (!pos(feeRate) || feeRate > 1) {
    fail("E_BAD_FEE_RATE",
         "fee rate must be a proportion in (0,1] and must be passed, not assumed",
         { given: feeRate });
  }
  const c = loadedCost(sectorId, routeId, jobsPerYear, o);
  const margin = isNum(o.targetMargin) ? o.targetMargin : 0;
  if (margin < 0 || margin >= 1) {
    fail("E_BAD_MARGIN", "target margin must be in [0,1)", { given: margin });
  }

  const atCost = c.loaded / feeRate;
  const atMargin = (c.loaded * (1 + margin)) / feeRate;

  return {
    sector: sectorId,
    route: routeId,
    jobs_per_year: jobsPerYear,
    fee_rate: feeRate,
    fee_basis: "allowances identified",
    loaded_cost: c.loaded,

    /* The number the phase asked for. */
    break_even_allowances: atCost,
    break_even_allowances_at_margin: atMargin,
    target_margin: margin,

    /* Same figure with the address lookup included, or null while the
       Homedata price is unknown. Never silently equal to the line above. */
    break_even_allowances_including_address_lookup:
      c.loaded_including_address_lookup === null
        ? null : c.loaded_including_address_lookup / feeRate,

    address_lookup_known: c.address_lookup.known,
    overhead_is_placeholder: c.overhead_is_placeholder
  };
}

/* Break-even expressed as a purchase price, using an INJECTED sector yield.
   Yields belong to Rulebook I and are "assessed, not independently calibrated";
   this file holds none of them. */
function breakEvenPurchasePrice(sectorId, routeId, jobsPerYear, feeRate, yieldRate, opts) {
  if (!pos(yieldRate) || yieldRate > 1) {
    fail("E_BAD_YIELD",
         "sector yield must be a proportion in (0,1] and comes from Rulebook I, "+
         "not from this file", { given: yieldRate });
  }
  const b = breakEvenAllowances(sectorId, routeId, jobsPerYear, feeRate, opts);
  return Object.assign({}, b, {
    yield_rate: yieldRate,
    break_even_purchase_price: b.break_even_allowances / yieldRate,
    break_even_purchase_price_at_margin: b.break_even_allowances_at_margin / yieldRate
  });
}

/* What the basis change did to the published figures. Takes the client's
   marginal tax rate because that is the whole of the difference. */
function reportsBasisChange(sectorId, routeId, jobsPerYear, feeRate, yieldRate, taxRate, opts) {
  if (!pos(taxRate) || taxRate > 1) {
    fail("E_BAD_TAX_RATE", "marginal tax rate must be a proportion in (0,1]",
         { given: taxRate });
  }
  const now = breakEvenPurchasePrice(sectorId, routeId, jobsPerYear, feeRate, yieldRate, opts);
  /* On the OLD basis the fee was feeRate x allowances x taxRate, so the same
     loaded cost needed 1/taxRate more allowances to cover it. */
  return {
    basis_now: "allowances identified (Q55, 3 September 2026)",
    basis_then: "lifetime relief (the basis of the 28 August 2026 research)",
    tax_rate: taxRate,
    break_even_purchase_price_now: now.break_even_purchase_price,
    break_even_purchase_price_on_old_basis: now.break_even_purchase_price / taxRate,
    factor: 1 / taxRate,
    direction: "the current basis breaks even on SMALLER jobs than the "+
               "published research says, because the fee is larger on "+
               "identical work"
  };
}

/* =============================================================================
   6. ROUTING — AND THE REFUSAL

   What the phase asked for: which jobs go desk-only, which need a visit, and
   whether anything should be declined rather than run at a loss.

   WHAT THIS FUNCTION WILL NOT DO. It will not name a route while the surveyor's
   defensibility question is open. It returns both routes' economics, states
   what each implies, and sets recommendation:null with a reason. When the
   answer lands, set PARAMS.desk_defensibility_answer and the refusal lifts.
   ============================================================================= */

function routeDecision(sectorId, allowances, jobsPerYear, feeRate, opts) {
  const o = opts || {};
  if (!isNum(allowances) || allowances < 0) {
    /* Unknown allowances is not zero allowances. */
    return {
      sector: sectorId,
      determined: false,
      why: "the allowances identified for this case have not been computed yet. "+
           "Nothing is routed and nothing is declined until they are.",
      routes: null, recommendation: null
    };
  }
  if (!pos(feeRate) || feeRate > 1) {
    fail("E_BAD_FEE_RATE", "fee rate must be passed", { given: feeRate });
  }

  const fee = allowances * feeRate;
  const margin = isNum(o.targetMargin) ? o.targetMargin : MODELLING.target_margin;

  const routes = {};
  ["DESK_ONLY", "SURVEYOR_VISIT"].forEach(function (rid) {
    const c = loadedCost(sectorId, rid, jobsPerYear, o);
    const contribution = fee - c.marginal;   /* covers overhead once positive */
    routes[rid] = {
      route: rid,
      priceable: ROUTES[rid].priceable,
      loaded_cost: c.loaded,
      marginal_cost: c.marginal,
      fee: fee,
      profit_on_loaded: fee - c.loaded,
      contribution_over_marginal: contribution,
      covers_loaded_cost: fee >= c.loaded,
      covers_marginal_cost: fee >= c.marginal,
      covers_loaded_cost_at_margin: fee >= c.loaded * (1 + margin),
      break_even_allowances: c.loaded / feeRate
    };
  });

  /* THE DECLINE TEST. A job that does not cover its MARGINAL cost on the
     CHEAPER of the two routes loses money however it is run — taking it makes
     us worse off than not taking it, before any overhead is recovered. That is
     the only decline this model asserts, and it asserts it on marginal rather
     than loaded cost deliberately: refusing everything that fails to carry a
     full share of overhead would decline most of year one's book, which is a
     commercial decision and not this file's to make. */
  const cheapest = routes.DESK_ONLY.marginal_cost <= routes.SURVEYOR_VISIT.marginal_cost
                   ? routes.DESK_ONLY : routes.SURVEYOR_VISIT;
  const declineable = fee < cheapest.marginal_cost;

  /* The band the phase asked about: below loaded cost on the cheaper route but
     above marginal. Worth taking for contribution, not worth taking at scale. */
  const thinBand = !declineable && fee < cheapest.loaded_cost;

  return {
    sector: sectorId,
    determined: true,
    allowances: allowances,
    fee: fee,
    fee_rate: feeRate,
    jobs_per_year: jobsPerYear,
    routes: routes,

    should_decline: declineable,
    decline_reason: declineable
      ? "the fee does not cover the marginal cost of the cheapest available "+
        "route, so this job loses money however it is run"
      : null,

    thin_band: thinBand,
    thin_band_note: thinBand
      ? "the fee covers what this job costs to do but not its share of "+
        "overhead. It is worth taking for contribution and not worth building "+
        "a book of."
      : null,

    /* THE REFUSAL. */
    recommendation: DESK_DEFENSIBILITY_ANSWERED
      ? (routes.DESK_ONLY.covers_loaded_cost_at_margin ? "DESK_ONLY" : "SURVEYOR_VISIT")
      : null,
    recommendation_withheld_because: DESK_DEFENSIBILITY_ANSWERED ? null
      : "which route a job needs depends on whether a building can be valued "+
        "without standing in it, and the surveyor has not been asked. Both "+
        "routes' economics are given above; naming one would answer a question "+
        "that is open."
  };
}

/* =============================================================================
   7. THE CROSS-CHECK AGAINST THE FEE GUARD

   The fee guard (CB_FEEGUARD / CB_BENEFIT, Phase 77) established that at 5%
   the fee exceeded every company client's year-one benefit at any pool split.
   At 3% (Phase 132e) that is no longer true: a company on main-pool plant
   clears the fee in year one and a company on special-rate plant does not, so
   the pool split now decides it. This module establishes where a job stops
   paying US.

   PUT TOGETHER, THERE IS A BAND WHERE BOTH ARE TRUE AT ONCE: the job loses us
   money AND the client is out of pocket in year one. That band is the worst
   possible engagement — we subsidise work the client would rather not have
   bought — and the phase asked for it to be named rather than discovered.

   THIS FUNCTION DOES NOT RE-IMPLEMENT CB_BENEFIT. It takes the comparison
   object CB_BENEFIT.compare() already returns. The test loads the shipped
   engine and passes a real one, so this cross-check is against the real fee
   guard and not against a copy of it that could drift.
   ============================================================================= */

const BANDS = {
  DECLINE:          "loses us money on the cheapest route",
  MUTUAL_LOSS:      "loses us money AND the client is out of pocket in year one",
  CLIENT_POOR_ONLY: "pays us, but the client is out of pocket in year one",
  US_THIN_ONLY:     "does not carry its overhead, but the client is fine in year one",
  SOUND:            "pays us and the client is ahead in year one",
  UNDETERMINED:     "one side of the comparison is not determined"
};

function classifyBand(decision, benefitComparison) {
  if (!decision || !decision.determined) {
    return { band: "UNDETERMINED", why: "no routing decision for this case",
             description: BANDS.UNDETERMINED };
  }

  const c = benefitComparison;

  /* CB_BENEFIT.compare returns fee_exceeds_year_one_benefit as true, false, or
     NULL — null meaning the scenarios in the range disagree, so it is not
     known. Null is not false. */
  const clientOutOfPocket = c && c.computed ? c.fee_exceeds_year_one_benefit : null;

  const usLosing = decision.should_decline;
  const usThin = decision.thin_band;

  if (clientOutOfPocket === null) {
    return {
      band: "UNDETERMINED",
      description: BANDS.UNDETERMINED,
      why: c && c.computed
        ? "the benefit model returns a range and its ends disagree about "+
          "whether the fee exceeds the year-one benefit, so it is not known"
        : "the benefit model is not determined for this case",
      our_side: usLosing ? "DECLINE" : (usThin ? "THIN" : "SOUND"),
      client_side: "unknown",
      /* Naming what would settle it, rather than leaving it as a null. */
      what_would_settle_it: c && c.unknowns ? c.unknowns : null
    };
  }

  let band;
  if (usLosing && clientOutOfPocket)        band = "MUTUAL_LOSS";
  else if (usLosing)                        band = "DECLINE";
  else if (clientOutOfPocket && usThin)     band = "MUTUAL_LOSS";
  else if (clientOutOfPocket)               band = "CLIENT_POOR_ONLY";
  else if (usThin)                          band = "US_THIN_ONLY";
  else                                      band = "SOUND";

  return {
    band: band,
    description: BANDS[band],
    our_side: usLosing ? "DECLINE" : (usThin ? "THIN" : "SOUND"),
    client_side: clientOutOfPocket ? "OUT_OF_POCKET_YEAR_ONE" : "AHEAD_YEAR_ONE",
    fee: decision.fee,
    allowances: decision.allowances,

    /* The third option Lakhbir has already said is live: the fee rate (3%, with
       a discretionary multi-site discount) is a variable sales discusses with
       the client. CB_BENEFIT computes the rate at which
       the fee stops exceeding the client's year-one benefit. Carried through
       here so a band this bad arrives with the number that fixes it. */
    breakeven_fee_rate_year_one:
      c && c.computed ? c.breakeven_fee_rate_year_one : null,

    /* And ours: the rate at which the job stops losing US money. Where the
       client's number is BELOW ours there is no rate that satisfies both, and
       that is the real finding rather than a discount to negotiate. */
    fee_rate_we_need_on_cheapest_route: (function () {
      const cheapest = Math.min(decision.routes.DESK_ONLY.loaded_cost,
                                decision.routes.SURVEYOR_VISIT.loaded_cost);
      return decision.allowances > 0 ? cheapest / decision.allowances : null;
    })(),

    no_rate_satisfies_both: (function () {
      if (!c || !c.computed || !isNum(c.breakeven_fee_rate_year_one)) return null;
      if (!(decision.allowances > 0)) return null;
      const cheapest = Math.min(decision.routes.DESK_ONLY.loaded_cost,
                                decision.routes.SURVEYOR_VISIT.loaded_cost);
      return (cheapest / decision.allowances) > c.breakeven_fee_rate_year_one;
    })()
  };
}

/* =============================================================================
   8. REPRODUCING THE PUBLISHED PAPER

   "Minimum fee — the research" (item 12830205390, 28 August 2026) published
   marginal and loaded cost tables that could not be re-derived by running
   anything, because the parameter variation behind them was never committed.

   This regenerates them. The test asserts every published cell. From here the
   paper is maintainable: change a route and the test tells you which published
   figure moved.
   ============================================================================= */

function reproducePublishedPaper(opts) {
  const o = opts || {};
  const volumes = o.volumes || [25, 50, 100, 200];
  const refSector = o.sector || "dental";   /* the paper's reference sector */

  const out = { sector: refSector, volumes: volumes, marginal: {}, loaded: {},
                loaded_with_salary: {}, minimum_fee_at_margin: {} };

  ["SURVEYOR_VISIT", "DESK_ONLY", "STRAIGHT_THROUGH"].forEach(function (rid) {
    const scen = ROUTES[rid].paper_scenario;
    out.marginal[scen] = directCost(refSector, rid) + failedEnquiryDrag(rid, {});
    out.loaded[scen] = {};
    out.loaded_with_salary[scen] = {};
    out.minimum_fee_at_margin[scen] = {};
    volumes.forEach(function (v) {
      const plain = loadedCost(refSector, rid, v, {});
      const salaried = loadedCost(refSector, rid, v, { includeFounderSalary: true });
      out.loaded[scen][v] = plain.loaded;
      out.loaded_with_salary[scen][v] = salaried.loaded;
      out.minimum_fee_at_margin[scen][v] = plain.loaded * (1 + MODELLING.target_margin);
    });
  });
  return out;
}

/* =============================================================================
   9. THE REBASE — PRICING A JOB ON THE DECIDED BASE
   (Phase 112, 9 September 2026)

   WHY THIS SECTION EXISTS. Sections 5 to 8 above answer "where does a job stop
   paying US". They do not price a job. Five documents on the board DO price
   jobs, and every fee figure in them was computed on LIFETIME RELIEF — the base
   the fee-basis options paper recommended and Q55 did not choose. Phase 101
   banned quoting from them; this section is what makes their numbers derivable
   again, so that no replacement figure is typed by hand into prose.

   THE ONE THING TO UNDERSTAND BEFORE READING ANY FUNCTION HERE.

       old fee = feeRate x allowances x the claimant's marginal tax rate
       new fee = feeRate x allowances

   So the client's tax rate has left our fee entirely. Every conclusion in those
   documents that turned on CLAIMANT TYPE — "the largest single factor", "the
   first question asked", "incorporating raises the break-even by roughly 60%" —
   is not merely understated. It has no referent. C7 above already asserts that
   two clients at different tax rates share one break-even; the functions here
   carry that through to the fee itself, and claimantTypeEntersTheFee() states it
   so a document can cite something runnable rather than a sentence.

   WHAT IS STILL INJECTED, AND IT IS THE SAME LIST AS EVERYWHERE ABOVE. The fee
   rate, the sector yield and the candidate minimum are PARAMETERS. This file
   holds no fee rate (the test reads CB_FEE.RATE out of the shipped engine), no
   yield (they belong to Rulebook I) and no minimum.

   PHASE 132e, 16 SEPTEMBER 2026 — THE FEE IS NOW DECIDED IN FULL. Lakhbir's
   answer, read 15 September 2026: "yes, flat fee of 3% of the allowances for 1
   or more properties", with no bands and no minimum, and "A further multi-site
   discount can be applied depending on site/opportunities". FEE_DECISION below
   records it. Consequences here:
     - there is NO MINIMUM FEE. The £5,000 / £7,500 candidates survive only as
       inputs a caller may pass to reproduce the old papers; no default holds
       them, and priceJobBothReadings() now says which reading was decided;
     - there are NO BANDS. bandedFee() and rescaledBands() no longer default to
       the rate card's published bands: a caller must pass bands explicitly,
       which only a record of the old card should ever do;
     - the multi-site discount is discretionary and is not modelled. Its
       largest size and who approves it are named nulls, never numbers.
   ============================================================================= */

const FEE_DECISION = {
  basis: "allowances identified",
  rate_source: "CB_FEE.RATE in the shipped engine",
  flat: true,
  bands: false,
  minimum_fee: false,
  multi_site_discount: {
    discretionary: true,
    fixed_tiers: null,
    largest_discount: null,
    approved_by: null,
    asked: "the largest discount and who approves it",
    applied_automatically: false
  },
  decided_by: "Lakhbir Dhillon",
  answer_read: "2026-09-15",
  built: "2026-09-16"
};

/* Does the claimant's tax rate change what we charge? It does not, and this is
   the single fact the rebuild of those five documents turns on. Stated as a
   function so a document can cite a runnable thing. */
function claimantTypeEntersTheFee() {
  return {
    enters: false,
    basis: "allowances identified (Q55, 3 September 2026)",
    why: "the fee is a percentage of the qualifying expenditure identified, "+
         "which is the same figure whoever owns the property. On the "+
         "superseded lifetime-relief base the fee was that figure multiplied "+
         "by the claimant's marginal rate, so a company at 25% paid 37.5% "+
         "less than an unincorporated claimant at 40% on identical work.",
    what_it_still_changes: "the CLIENT'S benefit, and therefore the fee guard "+
         "(CB_BENEFIT / CB_FEEGUARD) and every effective-rate figure quoted "+
         "as a share of their relief. It is our fee that stopped depending "+
         "on it, not their economics."
  };
}

/* The fee itself, on the decided base. Trivial arithmetic, named so that no
   document has to write "x 0.05" and be believed. */
function feeOnAllowances(allowances, feeRate) {
  if (!isNum(allowances) || allowances < 0) {
    fail("E_BAD_ALLOWANCES", "allowances must be a non-negative number",
         { given: allowances });
  }
  if (!pos(feeRate) || feeRate > 1) {
    fail("E_BAD_FEE_RATE", "fee rate must be passed, not assumed",
         { given: feeRate });
  }
  return allowances * feeRate;
}

/* Allowances implied by a purchase price at an injected sector yield. */
function allowancesFromPurchasePrice(purchasePrice, yieldRate) {
  if (!isNum(purchasePrice) || purchasePrice < 0) {
    fail("E_BAD_PURCHASE_PRICE", "purchase price must be a non-negative number",
         { given: purchasePrice });
  }
  if (!pos(yieldRate) || yieldRate > 1) {
    fail("E_BAD_YIELD", "sector yield must be injected; it comes from "+
         "Rulebook I, not from this file", { given: yieldRate });
  }
  return purchasePrice * yieldRate;
}

/* -----------------------------------------------------------------------------
   THE RATE CARD'S MARGINAL BANDS — A RECORD. THERE ARE NO BANDS (Phase 132e).

   The rate card as published banded the fee like income tax: each band applied
   only to the slice inside it. Lakhbir's answer of 15 September 2026 removed the
   bands ("no banding - flat fee of 3%"). The table and the function are kept so
   the old card's figures can be reproduced, and NEITHER IS A DEFAULT ANY MORE:
   a caller must pass bands explicitly. Its published breakpoints — £250,000 and £1,000,000 — are
   breakpoints IN THE BASE, and the base changed. This function takes the
   breakpoints as a parameter for exactly that reason: which breakpoints the
   rebuilt card should carry is a decision, not arithmetic, and this file
   refuses to make it. It will price either.
   --------------------------------------------------------------------------- */
const RATE_CARD_BANDS_AS_PUBLISHED = [
  { upTo: 250000,   rate: 0.050 },
  { upTo: 1000000,  rate: 0.040 },
  { upTo: Infinity, rate: 0.030 }
];

function bandedFee(base, opts) {
  const o = opts || {};
  if (!isNum(base) || base < 0) {
    fail("E_BAD_BASE", "the banded base must be a non-negative number",
         { given: base });
  }
  if (!Array.isArray(o.bands) || o.bands.length === 0) {
    fail("E_NO_BANDS", "there are no fee bands - the fee is a flat percentage "+
         "(Phase 132e). Pass bands explicitly to reproduce a record of the old "+
         "rate card", { given: o.bands });
  }
  const bands = o.bands;
  let last = 0, fee = 0;
  const slices = [];
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    if (!pos(b.rate) || b.rate > 1) {
      fail("E_BAD_BAND_RATE", "each band rate must be a proportion in (0,1]",
           { band: i, given: b.rate });
    }
    if (b.upTo <= last) {
      fail("E_BAD_BAND_ORDER", "band breakpoints must increase",
           { band: i, given: b.upTo, previous: last });
    }
    const top = Math.min(base, b.upTo);
    if (top > last) {
      slices.push({ from: last, to: top, rate: b.rate, fee: (top - last) * b.rate });
      fee += (top - last) * b.rate;
    }
    last = b.upTo;
    if (base <= b.upTo) break;
  }
  return {
    base: base,
    fee: fee,
    slices: slices,
    /* The whole point of banding: this falls as the job grows. */
    effective_rate: base > 0 ? fee / base : null,
    breakpoints: bands.map(b => b.upTo)
  };
}

/* Rescaling the published breakpoints so the SAME physical jobs sit in the same
   bands after the base change. Divides by the tax rate the old card's
   breakpoints were implicitly expressed at. Returned as a candidate, not as the
   answer — the card's breakpoints are Lakhbir's and Saddique's to set. */
function rescaledBands(taxRate, opts) {
  const o = opts || {};
  if (!pos(taxRate) || taxRate > 1) {
    fail("E_BAD_TAX_RATE", "marginal tax rate must be a proportion in (0,1]",
         { given: taxRate });
  }
  if (!Array.isArray(o.bands) || o.bands.length === 0) {
    fail("E_NO_BANDS", "there are no fee bands - the fee is a flat percentage "+
         "(Phase 132e). Pass bands explicitly to rescale a record of the old "+
         "rate card", { given: o.bands });
  }
  const bands = o.bands;
  return bands.map(b => ({
    upTo: b.upTo === Infinity ? Infinity : b.upTo / taxRate,
    rate: b.rate
  }));
}

/* -----------------------------------------------------------------------------
   THE CROSSOVER — the purchase price at which the percentage overtakes a
   candidate minimum fee.

   This is the number the two minimum-fee papers built their central conclusion
   on: that the minimum IS the price for most of the book, because on the old
   base the percentage did not overtake £5,000 until a dental purchase reached
   £1.1m. On the decided base it overtakes far sooner, and — because claimant
   type has left the fee — there is now ONE crossover per sector instead of two.
   --------------------------------------------------------------------------- */
function crossoverPurchasePrice(minimumFee, feeRate, yieldRate, opts) {
  const o = opts || {};
  if (!pos(minimumFee)) {
    fail("E_BAD_MINIMUM", "a candidate minimum fee must be passed; this file "+
         "holds none, because none has been decided", { given: minimumFee });
  }
  if (!pos(feeRate) || feeRate > 1) {
    fail("E_BAD_FEE_RATE", "fee rate must be passed", { given: feeRate });
  }
  if (!pos(yieldRate) || yieldRate > 1) {
    fail("E_BAD_YIELD", "sector yield must be injected", { given: yieldRate });
  }

  const allowancesAtCrossover = minimumFee / feeRate;
  const priceAtCrossover = allowancesAtCrossover / yieldRate;

  const out = {
    minimum_fee: minimumFee,
    fee_rate: feeRate,
    yield_rate: yieldRate,
    basis: "allowances identified (Q55, 3 September 2026)",
    crossover_allowances: allowancesAtCrossover,
    crossover_purchase_price: priceAtCrossover,
    /* THE STRUCTURAL POINT. One number, not one per claimant type. */
    one_crossover_per_sector: true,
    claimant_type_enters: false
  };

  /* The comparison, when a tax rate is supplied. Never assumed — an absent tax
     rate leaves these keys off rather than defaulting one. */
  if (o.taxRate !== undefined) {
    if (!pos(o.taxRate) || o.taxRate > 1) {
      fail("E_BAD_TAX_RATE", "marginal tax rate must be a proportion in (0,1]",
           { given: o.taxRate });
    }
    out.tax_rate = o.taxRate;
    out.crossover_purchase_price_on_old_basis = priceAtCrossover / o.taxRate;
    out.factor = 1 / o.taxRate;
    out.direction = "the minimum stops binding on a SMALLER job than the "+
                    "published papers say, because the fee is larger on "+
                    "identical work";
  }
  return out;
}

/* -----------------------------------------------------------------------------
   PRICING ONE JOB BOTH WAYS — AND THE QUESTION IS NOW CLOSED.

   Lakhbir decided on 1 September 2026 that there is no minimum JOB SIZE, and
   on 15 September 2026 (answer read that day, Phase 132e) that there is no
   minimum FEE either: a flat 3% "with no minimum and no bands". So the
   "minimum_withdrawn" reading below IS the decided price. The retained reading
   is still computed, so the old papers' comparison can be reproduced, and it
   is labelled as the reading that was not chosen.
   --------------------------------------------------------------------------- */
function priceJobBothReadings(sectorId, routeId, purchasePrice, yieldRate,
                              feeRate, jobsPerYear, minimumFee, opts) {
  const o = opts || {};
  const allowances = allowancesFromPurchasePrice(purchasePrice, yieldRate);
  const percentageFee = feeOnAllowances(allowances, feeRate);
  const cost = loadedCost(sectorId, routeId, jobsPerYear, o);

  if (!pos(minimumFee)) {
    fail("E_BAD_MINIMUM", "a candidate minimum fee must be passed even to "+
         "price the reading that does not apply one, so that the two "+
         "readings are comparable", { given: minimumFee });
  }

  const withMin = Math.max(percentageFee, minimumFee);
  const mk = (fee, label) => ({
    reading: label,
    fee: fee,
    loaded_cost: cost.loaded,
    marginal_cost: cost.marginal,
    margin_on_loaded: fee - cost.loaded,
    covers_loaded_cost: fee >= cost.loaded,
    covers_marginal_cost: fee >= cost.marginal,
    effective_rate_on_allowances: allowances > 0 ? fee / allowances : null
  });

  return {
    sector: sectorId,
    route: routeId,
    jobs_per_year: jobsPerYear,
    purchase_price: purchasePrice,
    yield_rate: yieldRate,
    allowances: allowances,
    fee_rate: feeRate,
    percentage_fee: percentageFee,
    candidate_minimum: minimumFee,

    /* Reading 1: the launch minimum survived. NOT CHOSEN. */
    minimum_retained: mk(withMin, "the £5,000 / £7,500 launch minimum still stands - not chosen"),
    /* Reading 2: it did not, and the percentage is the whole price. DECIDED. */
    minimum_withdrawn: mk(percentageFee, "there is no minimum fee, only the percentage - decided 15 September 2026"),

    /* The only thing that separates the two readings on THIS job. */
    minimum_binds: percentageFee < minimumFee,
    the_two_readings_differ_by: withMin - percentageFee,

    /* Resolved, and named. */
    decided_reading: "minimum_withdrawn",
    decision: "there is no minimum fee: a flat percentage of the allowances "+
      "identified, with no bands (Lakhbir Dhillon, answer read 15 September "+
      "2026). The old question - whether the launch minimum survived the 1 "+
      "September 2026 no-minimum-job-size decision - is closed."
  };
}

/* The blended fee across an assumed client mix — the business plan's forecast
   input. Shares must sum to 1; a mix that does not is a mistake, not a
   normalisation opportunity. */
function blendedFeePerJob(mix, feeRate, minimumsBySector, opts) {
  if (!Array.isArray(mix) || mix.length === 0) {
    fail("E_BAD_MIX", "the client mix must be a non-empty array", { given: mix });
  }
  const total = mix.reduce((a, m) => a + m.share, 0);
  if (!near1(total)) {
    fail("E_BAD_MIX_SHARES", "the mix shares must sum to 1",
         { given: total, mix: mix.map(m => m.share) });
  }
  const rows = mix.map(function (m) {
    const allowances = allowancesFromPurchasePrice(m.purchase_price, m.yield_rate);
    const pct = feeOnAllowances(allowances, feeRate);
    const min = minimumsBySector ? minimumsBySector[m.sector] : undefined;
    if (min !== undefined && !pos(min)) {
      fail("E_BAD_MINIMUM", "a supplied sector minimum must be positive",
           { sector: m.sector, given: min });
    }
    return {
      sector: m.sector,
      share: m.share,
      purchase_price: m.purchase_price,
      allowances: allowances,
      percentage_fee: pct,
      minimum: min === undefined ? null : min,
      fee_minimum_retained: min === undefined ? pct : Math.max(pct, min),
      minimum_binds: min === undefined ? false : pct < min
    };
  });
  const blend = k => rows.reduce((a, r) => a + r.share * r[k], 0);
  return {
    fee_rate: feeRate,
    rows: rows,
    blended_fee_minimum_retained: blend("fee_minimum_retained"),
    blended_fee_minimum_withdrawn: blend("percentage_fee"),
    sectors_where_the_minimum_binds: rows.filter(r => r.minimum_binds).map(r => r.sector),
    share_of_jobs_where_the_minimum_binds:
      rows.filter(r => r.minimum_binds).reduce((a, r) => a + r.share, 0)
  };
}

const near1 = t => Math.abs(t - 1) < 1e-9;

/* What the fee costs the CLIENT as a share of their lifetime relief. This is
   the figure that gets WORSE under the decided base, and it is the one the
   documents must not lose: on the old base the fee was a flat 5% of relief by
   construction; on the allowances base it is feeRate/taxRate of relief — at
   the decided 3%, 7.5% for a 40% payer and 12% for a company at 25% (it was
   12.5% and 20% at 5%). */
function effectiveRateOnLifetimeRelief(fee, allowances, taxRate) {
  if (!isNum(fee) || fee < 0) {
    fail("E_BAD_FEE", "fee must be a non-negative number", { given: fee });
  }
  if (!pos(allowances)) {
    fail("E_BAD_ALLOWANCES", "allowances must be positive to express a rate "+
         "against relief", { given: allowances });
  }
  if (!pos(taxRate) || taxRate > 1) {
    fail("E_BAD_TAX_RATE", "marginal tax rate must be a proportion in (0,1]",
         { given: taxRate });
  }
  const relief = allowances * taxRate;
  return {
    fee: fee,
    allowances: allowances,
    tax_rate: taxRate,
    lifetime_relief: relief,
    effective_rate_on_relief: fee / relief,
    effective_rate_on_allowances: fee / allowances,
    note: "our fee no longer depends on the claimant's rate, but what the "+
          "client gets for it still does. The share of their relief that the "+
          "fee consumes is HIGHER on the decided base, not lower."
  };
}

/* =============================================================================
   10. EXPORTS
   ============================================================================= */

/* =============================================================================
   10. THE ENGAGEMENT GATE'S COST INPUT — PHASE 113d, board item 13005159647

   THE GATE ITSELF IS NOT HERE. It lives in the site engine, as CB_GATE, next
   to the fee module whose quote it withholds. What lives here is the ONE thing
   the gate must not compute for itself: the loaded cost of the job it is being
   asked to price.

   WHY THE SPLIT IS THE WHOLE POINT. Four documents specify the gate and none
   of them implements it; the risk in finally building it was that the site
   would grow a second cost model, drift from this one, and be wrong in the
   direction that suited whoever last touched it. So the site holds a DECISION
   and injects its COSTING, this file is the only calculator, and the
   regression harness wires the two together and asserts the gate's arithmetic
   is this function's output rather than a copy of it.

   IT DOES NOT THROW, AND THAT IS DELIBERATE. loadedCost() throws E_BAD_VOLUME
   on a volume it cannot use, which is right for a modelling call a person
   wrote. It is wrong for a gate: a missing annual volume is a fact about the
   business, not a programming error, and a gate that throws on it takes a
   screen down. So this returns {known:false} naming the parameter, exactly as
   addressLookupCost() does for the Homedata price. Unknown is not a branch.
   ============================================================================= */

/* The gate's own settings, as far as they are arithmetic rather than policy.
   The site's CB_GATE_CONFIG restates these two, because it cannot require this
   file; Suite T of the regression harness asserts the two agree, the same way
   SECTOR_DIRECT is asserted against the business plan model. */
const GATE = {

  /* The 25% of "loaded cost plus a 25% target margin". Not a new number:
     MODELLING.target_margin, named again here so the gate's contract reads in
     one place. Asserted equal. */
  target_margin: MODELLING.target_margin,

  /* S7.3, first requirement: the cost input must be the delivery scenario we
     are ACTUALLY running, from ONE config value. Today that is S1 — the
     desktop pack's judgement sections are empty pending a surveyor's
     correction pass, so a surveyor produces the valuation. When the §7.2
     step-down fires, this moves, and the gate moves with it here. */
  delivery_scenario_today: "SURVEYOR_VISIT",

  /* S7.3, second requirement: the CURRENT YEAR'S ACTUAL job volume, not an
     assumed 100. SUPPLIED 15 SEPTEMBER 2026: Lakhbir Dhillon gave 120 jobs
     this year when he switched the gate on (answer read that day, built by
     Phase 132e on 16 September 2026). It was null until then. The site's
     CB_GATE_CONFIG.jobs_per_year restates it and Suite T asserts the two agree.
     120 is about five to seven times the business plan's own volume (16 in
     year one; the papers use 25), so the warning below applies to it.

     WHY THIS ONE MATTERS MORE THAN IT LOOKS. At 25 jobs a year the S1 loaded
     cost for dental is £5,390 against £3,590 at 100 — 50% higher — and the
     business plan model's own ramp reaches 16 jobs in year one, not 25. A gate
     calibrated on 100 does not merely mis-price: it passes every job that
     loses money for the whole of year one, which is the exact failure the gate
     exists to stop. Defaulting this to 100 would build the defect into the
     control. */
  current_year_jobs: 120
};

/* The gate's cost input. Returns {known:false, parameter} rather than throwing
   or guessing, for any input it does not have.

   opts is passed through to loadedCost() unchanged, so overheadPerYear,
   includeFounderSalary, conversionRate and the rest behave exactly as they do
   everywhere else in this file. */
function costingForGate(sectorId, routeId, jobsPerYear, opts) {
  const unknown = (parameter, why) => ({
    known: false,
    parameter: parameter,
    why: why,
    loaded: null,
    sector: sectorId,
    route: routeId,
    jobs_per_year: jobsPerYear
  });

  if (!ROUTES[routeId]) {
    return unknown("delivery_scenario",
      "no such delivery scenario: " + String(routeId) +
      ". Known: " + Object.keys(ROUTES).join(", "));
  }
  if (!SECTOR_DIRECT[sectorId]) {
    return unknown("sector",
      "no such sector: " + String(sectorId) +
      ". Known: " + SECTORS.join(", "));
  }
  if (!pos(jobsPerYear)) {
    return unknown("jobs_per_year",
      "the gate needs the current year's actual job volume. Nobody has "+
      "supplied one, and it does not default to 100 — at 25 jobs a year the "+
      "loaded cost is about 50% higher and a gate calibrated on 100 waves "+
      "through a whole year of loss-making work.");
  }

  const c = loadedCost(sectorId, routeId, jobsPerYear, opts || {});

  return {
    known: true,
    parameter: null,
    why: null,

    /* The one number the gate consumes. */
    loaded: c.loaded,

    sector: sectorId,
    route: routeId,
    jobs_per_year: jobsPerYear,
    marginal: c.marginal,
    direct: c.direct,
    overhead_per_job: c.overhead_per_job,
    failed_enquiry_drag: c.failed_enquiry_drag,

    /* CARRIED, NOT SWALLOWED. The overhead behind this figure is the £60,000
       placeholder unless the caller passed a real one — PARAMS.overhead_per_year
       is null and nobody has supplied it. That does NOT make the cost unknown,
       and the gate is not blocked on it: the placeholder is the published
       paper's own input and a gate that refused to run without a measured
       overhead could never run at all. But a decision taken on it is taken on
       an estimate, and the gate says so rather than presenting it as measured.
       Also true of the £1,500-£3,500 surveyor line, which is an estimate and
       not a quote — the published research calls it the weakest input it has. */
    overhead_is_placeholder: c.overhead_is_placeholder,
    overhead_basis: c.overhead_basis,
    includes_founder_salary: c.includes_founder_salary,

    /* Never folded in silently. Same rule as loadedCost(). */
    address_lookup_known: c.address_lookup.known,
    loaded_including_address_lookup: c.loaded_including_address_lookup
  };
}

/* The threshold the gate compares a fee against, expressed here so that the
   arithmetic "loaded cost plus a target margin" exists once. */
function gateThreshold(loaded, targetMargin) {
  if (!pos(loaded)) {
    fail("E_BAD_LOADED_COST", "a loaded cost must be positive", { given: loaded });
  }
  const m = isNum(targetMargin) ? targetMargin : GATE.target_margin;
  if (m < 0 || m >= 1) {
    fail("E_BAD_MARGIN", "target margin must be in [0,1)", { given: targetMargin });
  }
  return loaded * (1 + m);
}

module.exports = {
  JobEconError,
  SECTOR_DIRECT, SECTORS, ROUTES, PARAMS, MODELLING, BANDS, LINE_NAMES,
  SECTOR_INVARIANT_SURVEYOR,
  DESK_DEFENSIBILITY_ANSWERED,
  FEE_DECISION,

  surveyorCost, ctaCost, internalCost,
  directCost, failedEnquiryDrag, overheadPerJob, addressLookupCost, loadedCost,

  breakEvenAllowances, breakEvenPurchasePrice, reportsBasisChange,
  routeDecision, classifyBand,
  reproducePublishedPaper,

  /* Section 9 — the rebase (Phase 112) */
  RATE_CARD_BANDS_AS_PUBLISHED,
  claimantTypeEntersTheFee, feeOnAllowances, allowancesFromPurchasePrice,
  bandedFee, rescaledBands, crossoverPurchasePrice,
  priceJobBothReadings, blendedFeePerJob, effectiveRateOnLifetimeRelief,

  /* Section 10 — the engagement gate's cost input (Phase 113d) */
  GATE, costingForGate, gateThreshold
};
