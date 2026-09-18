/* =============================================================================
   CAPREBATE — RESIDUAL COST MODEL (Phase 9)

   Board 18422317809. Plan doc 46256300.
   Items: 12804374366 (LEG-E2), 12804380489 (LEG-E3), 12804374707 (LEG-E4),
          12804317685 (LEG-E5), 12804374838 (valuation basis switch).

   ---------------------------------------------------------------------------
   STATUS: PREPARED, NOT SHIPPED.

   Nothing in this file is wired into caprebate-site.html. The shipped engine
   values a claim from sector YIELD BANDS (QE = base x band). This module is the
   RESIDUAL REPLACEMENT-COST model that Build-Prep-Care-Homes-Estimate-Engine-
   Specification.md sections 4.1-4.3 describes and that nothing has yet
   implemented. The four LEG-E fixes are fixes to THIS model, which is why they
   could not be applied to the shipped engine: the code they correct did not
   exist. It exists now, with the corrections designed in from the start and
   held behind gates.

   THE RULE THIS FILE OBEYS
     Every gate in CB_P9_GATES defaults to FALSE, and false means "behave as the
     specification currently says", not "behave correctly". Turning a gate on is
     a deliberate act that belongs to whoever clears the licence or buys the
     book. The data tables that the gated behaviour needs are EMPTY STUBS. A
     gate turned on over an empty table does NOT quietly fall back to a
     plausible number - it throws E_TABLE_NOT_LOADED. Silence is how a stub
     becomes a fabricated figure.

   WHAT IS LICENSED AND WHAT IS NOT - read this before touching the gates
     LEG-E2  needs NO data at all. It removes a multiplier. See the note at
             prelimsFactor(). This item is marked blocked on the VOA licence and
             that block is queried on the board.
     LEG-E3  needs the VOA professional fee scale. Genuinely licensed.
     LEG-E4  needs a commercial cost library (Spon's / BCIS). NOT a licence
             question - a purchase, board item 12804374406.
     LEG-E5  needs VOA obsolescence scales (licensed) AND CIBSE plant lives
             (a separate source with its own terms). Two tables, two sources.
     BASIS   needs nothing. It is a switch. It is complete and it is live.

   RUN THE TESTS
     node --test caprebate-cost-model.test.cjs
   ============================================================================= */

"use strict";

/* ----------------------------------------------------------------- errors -- */

class CostModelError extends Error {
  constructor(code, message, detail) {
    super(message);
    this.name = "CostModelError";
    this.code = code;
    this.detail = detail || {};
  }
}
const fail = (code, message, detail) => { throw new CostModelError(code, message, detail); };

/* ------------------------------------------------------------------ gates -- */
/* Every one of these is false. False = the model behaves as the specification
   currently documents it, defects included. That is deliberate: this file must
   be droppable into the tree without changing a single number anywhere. */

const CB_P9_GATES = {
  /* LEG-E2 (12804374366) - stop multiplying replacement cost by (1 + prelims).
     BLOCKED on the board against the VOA licence. Queried - see prelimsFactor. */
  leg_e2_drop_prelims_from_erc: false,

  /* PHASE 132 (14 September 2026) - "Stop counting site overheads twice in the
     cost build-up". WHETHER THE UNIT RATE ALREADY CARRIES ON-COSTS IS A FACT
     ABOUT THE PRICE BOOK, NOT ABOUT THE JOB. A replacement-cost rate that
     includes on-costs makes the 18% preliminaries uplift a double count; an
     element rate that excludes them does not. leg_e2_drop_prelims_from_erc
     drops prelims on EVERY residual job whatever book priced it; this gate
     instead reads rates_include_oncosts off the named entry in CB_PRICE_SOURCES
     and drops prelims only where the book says its rates carry them. An
     unnamed book, an unlisted one, or a book whose answer is not recorded
     refuses - it never defaults either way (N4). The two leg_e2 gates are
     alternatives: both on refuses with E_GATE_CONFLICT. */
  leg_e2_oncosts_by_price_source: false,

  /* LEG-E3 (12804380489) - replace the flat 15% professional fee uplift with
     the VOA banded fee scale. BLOCKED on the VOA licence. Genuinely so. */
  leg_e3_voa_fee_scale: false,

  /* F-1 (12927234375) - the professional-fee rate by BUILDING TYPE: the VOA
     fee scale's adders for highly serviced buildings and for hospitals, on
     top of the banded base rate. Built by Phase 129 on 12 September 2026 from
     the prepared patch of 29 August; its values are an EMPTY STUB, same
     licence as the base scale. INTERLOCKED with leg_e3_voa_fee_scale:
     feesFactor refuses if the base scale is on and this is not, because the
     base bands alone under-read fees on every job this business will do. */
  leg_e3_building_type_adder: false,

  /* LEG-E4 (12804374707) - apply a regional location factor and a contract
     size adjustment. BLOCKED on the cost library purchase (12804374406). */
  leg_e4_location_and_contract_size: false,

  /* PHASE 132 (14 September 2026) - a contract OUTSIDE the price book's
     contract-size window (about GBP 2m to GBP 5m). WAITS ON THE SURVEYOR.
     Off, interpolateScale refuses off either end, exactly as it has since
     Phase 97. On, the adjustment is HELD AT THE NEAREST LIMIT and the result
     says which way that errs: above valid_to the valid_to value OVERSTATES
     cost (larger contracts carry lower rates than the book's last point);
     below valid_from the valid_from value UNDERSTATES it. Holding at a limit
     is a convention a surveyor has to accept - it is not the publisher's data -
     which is why it is a gate and not a fix. Only the LEG-E4 contract-size
     scale reads this; the fee bands and every other scale are unaffected. */
  leg_e4_contract_size_outside_window: false,

  /* ATP-F-3 (12927234437) - the CIBSE-to-taxonomy CROSSWALK COMPLETENESS GATE.
     Built by Phase 129 on 12 September 2026 from the prepared patch of 29
     August. elementDepreciationFactor already refuses an unlisted element when
     it meets one (E_PLANT_LIFE_NOT_IN_TABLE); that guard is correct but
     reactive, so a partial crosswalk is only found mid-job. With this gate on,
     per-element depreciation first checks the loaded CIBSE lives against EVERY
     element id the fixture taxonomy can emit (opts.taxonomy_element_refs) and
     refuses the job if one is missing, before any element is priced. It
     relieves nobody - it only refuses - and off it changes nothing. A life that
     is absent and a life recorded as not known are the same missing entry (N4).
     Turning LEG-E5 on without this check passing is the Gate Activation
     Record's mandatory pre-flip step skipped. */
  leg_e5_crosswalk_completeness_gate: false,

  /* LEG-E5 (12804317685) - per-element depreciation from VOA obsolescence
     scales and CIBSE plant lives. BLOCKED on the VOA licence and on CIBSE. */
  leg_e5_per_element_depreciation: false,

  /* LEG-E5b (12927234437, Phase 52) - WHOLE-BUILDING depreciation: one
     age-derived factor applied to every element, the VOA contractor's-basis
     shape. The alternative to E5, not an addition to it.

     WHY IT EXISTS. E5's own header argues per-element is the right method for
     a capital allowances claim, and that argument is sound - but it is OUR
     argument, not a surveyor's, and the ATP-F-3 finding (item 12927234437) is that
     applying a whole-BUILDING obsolescence scale per plant ELEMENT over a
     CIBSE life is a methodological hybrid nobody has ruled on. If the ruling
     comes back against it, E5 does not ship in its current form and there is
     currently no second method to fall back to. This is that method, built now
     so the choice is a switch rather than a rebuild.

     BLOCKED on the VOA obsolescence licence, same as E5. It needs only ONE
     table, not two - a whole building has no CIBSE plant life - which is
     itself the clearest statement of how the two methods differ. */
  leg_e5b_whole_building_depreciation: false
};

/* ------------------------------------------------------- the empty tables -- */
/* Each carries loaded:false and a licence note. Nothing reads a table without
   checking loaded first. requireTable() is the only accessor. */

function emptyTable(id, source, licence, shape) {
  return Object.assign({
    table_id: id,
    source: source,
    licence: licence,
    loaded: false,
    verified_at: null,
    base_year: null
  }, shape);
}

/* LEG-E3. The VOA professional fee scale. Banded on construction cost: the
   fee percentage falls as the contract grows. Bands are [floor, ceiling, rate].
   EMPTY - the scale itself is VOA data and may not be reproduced until the
   licence is cleared. */
const CB_VOA_FEE_SCALE = emptyTable(
  "CB_VOA_FEE_SCALE",
  "Valuation Office Agency - professional fee scale",
  "NOT CLEARED - board item 12804380489 blocked on VOA licence",
  { bands: [] }
);

/* F-1. VOA fee-scale building-type adders: flat additive rates on top of the
   banded base rate, keyed "standard" / "highly_serviced" / "hospital". EMPTY -
   VOA data, same licence as the base scale. The two published figures are
   quoted in the Activation Test Plan's research note; quoting a figure in a
   research note is not loading it for production use, so they are not here. */
const CB_VOA_FEE_BUILDING_TYPE_ADDERS = emptyTable(
  "CB_VOA_FEE_BUILDING_TYPE_ADDERS",
  "Valuation Office Agency - professional fee scale, building-type adders",
  "NOT CLEARED - board item 12927234375 waits on the VOA licence, same as CB_VOA_FEE_SCALE",
  { adders: {} }
);

/* The building types the adder is keyed on. Never defaulted from a sector:
   whether a given GP surgery is "highly serviced" is a valuation judgement. */
const BUILDING_TYPE = { STANDARD: "standard", HIGHLY_SERVICED: "highly_serviced", HOSPITAL: "hospital" };

/* LEG-E4a. Regional location factors. The board's worked example is Cardiff at
   94 against a national mean of 100 - i.e. building in Cardiff costs about 6%
   less than the national mean, so a national rate applied to a Cardiff property
   overstates replacement cost by about 6%. EMPTY - these are priced data from
   Spon's or BCIS and we have not bought either.

   THE BASE IS DECLARED, NOT ASSUMED. Corrected 14 September 2026 (Phase 132).
   This stub used to carry "mean: 100" and the factor was raw / mean. That is
   right only for a table indexed to a national mean of 100, and the books we
   would buy are not all that: Spon's is indexed to Outer London = 1.00, and the
   Mechanical and Electrical book uses a third base again. Dividing a table
   indexed to Outer London by a mean of 100 gives a factor near 0.01 and still
   returns a number. So a loaded table now declares:

     price_source  the CB_PRICE_SOURCES entry it was published with
     index_base    { basis: "outer_london" | "national_mean" | "publisher_other",
                     base_key, base_value } - which row of THIS table is the
                   base, and the value that row carries (checked, not trusted)
     factors       { key: value }, all on that one base

   and the factor is factors[property] / factors[where the rates are priced],
   both read from this one table. A table still carrying a bare mean refuses
   (E_LOCATION_MEAN_DEPRECATED) rather than being read the old way. */
const CB_LOCATION_FACTORS = emptyTable(
  "CB_LOCATION_FACTORS",
  "Spon's Architects & Builders Price Book / BCIS location factors",
  "NOT PURCHASED - board item 12804374406 (approx GBP 330)",
  { price_source: null, index_base: null, factors: {} }
);

/* The three index bases a location table may declare. publisher_other is for
   a book whose base is neither of the first two (the M&E book); it still names
   its base row and value, so it is checked the same way. */
const INDEX_BASIS = {
  OUTER_LONDON: "outer_london",
  NATIONAL_MEAN: "national_mean",
  PUBLISHER_OTHER: "publisher_other"
};

/* PHASE 132 (14 September 2026). THE PRICE BOOKS, AS FACTS ABOUT EACH BOOK.
   One entry per price source, keyed by an id the job names as price_source:

     label                 which book and edition
     rates_include_oncosts true | false | null - whether its unit rates already
                           carry site on-costs (prelims). null until someone
                           has READ the book's preamble and recorded the answer.
                           Never defaulted either way (leg_e2_oncosts_by_price_source).
     index_base            the base its location table is indexed to - the same
                           shape as CB_LOCATION_FACTORS.index_base, and it must
                           match that table's declaration exactly
     rates_priced_at_key   the row of the location table the book's unit rates
                           are priced at, so a factor can move them off it

   EMPTY - every entry describes a book we have not bought, and each fact comes
   from reading that book, not from memory. The shape of an entry is: */
const PRICE_SOURCE_ENTRY_SHAPE = {
  label: null,
  rates_include_oncosts: null,
  index_base: null,
  rates_priced_at_key: null
};
const CB_PRICE_SOURCES = emptyTable(
  "CB_PRICE_SOURCES",
  "Caprebate register of price books - one entry per book, recorded from each book's own preamble",
  "NOT PURCHASED - describes the books of board item 12804374406; nothing can be recorded until they are bought and read",
  { sources: {} }
);

/* LEG-E4b. Contract size adjustment. Larger contracts carry lower unit rates;
   a price book quotes at an assumed contract size and the adjustment moves the
   cost plan off that assumption.

   THIS TABLE IS A CONTINUOUS SCALE, NOT A SET OF BANDS. Corrected 7 September
   2026 (Phase 97). It shipped as bands: [floor, ceiling, factor] read through
   bandLookup, and that was wrong in two ways at once:

     (a) the published scale is INTERPOLATED between its tabulated points, not a
         step function. A step function puts a discontinuity in the middle of
         the scale - two jobs GBP 1 apart either side of a band edge get
         materially different replacement costs, which the source does not say
         and cannot defend.
     (b) the source publishes a PERCENTAGE ADJUSTMENT (e.g. -5%), and the band
         slot held a FACTOR (0.95). Loading published figures straight into that
         slot would have silently multiplied every cost by about -5 rather than
         by 0.95. quoted_as now states which of the two the points hold, and
         percentageAdjustmentToFactor does the conversion in one place.

   AND IT HAS A VALIDITY WINDOW, WHICH REFUSES RATHER THAN EXTRAPOLATES. The
   book declares its adjustment valid only over a stated contract-value range -
   about GBP 2m to GBP 5m. Outside that range there is no published adjustment,
   and a linear extrapolation off the end of a curve the publisher did not draw
   is our invention, not their data. valid_from / valid_to are therefore
   REQUIRED on a loaded table and an out-of-range contract value throws.
   This is not a theoretical path: the standing worked example on the board is a
   GBP 6m contract, so refusal is what will fire first when the book is bought.
   Phase 132 (14 September 2026) added the surveyor's alternative behind
   leg_e4_contract_size_outside_window, OFF: hold at the nearer limit and say
   which way that errs. Off, the refusal above is unchanged.

   points are [contract_value, published_value] pairs, ascending on
   contract_value, at least two, all inside the validity window.
   EMPTY - same purchase. */
const CB_CONTRACT_SIZE_ADJUSTMENT = emptyTable(
  "CB_CONTRACT_SIZE_ADJUSTMENT",
  "Spon's / BCIS contract size adjustment",
  "NOT PURCHASED - board item 12804374406",
  {
    assumed_contract_value: null,
    quoted_as: null,        /* "percentage_adjustment" | "factor" */
    valid_from: null,
    valid_to: null,
    points: []
  }
);

/* LEG-E5a. VOA obsolescence scales. Given an element's age as a proportion of
   its expected life, the scale returns the proportion of replacement cost that
   survives. EMPTY - VOA data. */
const CB_VOA_OBSOLESCENCE = emptyTable(
  "CB_VOA_OBSOLESCENCE",
  "Valuation Office Agency - obsolescence / age-depreciation scales",
  "NOT CLEARED - board item 12804317685 blocked on VOA licence",
  { scales: {} }
);

/* LEG-E5b. CIBSE expected plant lives, in years, per element. A SEPARATE
   SOURCE from the VOA scales with its own terms - clearing one does not clear
   the other, and E5 needs both. EMPTY. */
const CB_CIBSE_PLANT_LIVES = emptyTable(
  "CB_CIBSE_PLANT_LIVES",
  "CIBSE Guide M - indicative economic life of plant",
  "NOT CLEARED - separate source from the VOA scales",
  { lives_years: {} }
);

/* LEG-E5b. WHOLE-BUILDING obsolescence. Banded on the building's age IN YEARS,
   not on an age ratio, because a building has no CIBSE expected life to form a
   ratio against - that concept belongs to plant. The shape difference is not
   cosmetic: it is why the two methods cannot share a table and why choosing
   between them is a real choice rather than a parameter. EMPTY - VOA data. */
const CB_VOA_BUILDING_OBSOLESCENCE = emptyTable(
  "CB_VOA_BUILDING_OBSOLESCENCE",
  "Valuation Office Agency - whole-building age/obsolescence allowance",
  "NOT CLEARED - board item 12804317685 blocked on VOA licence (same licence as " +
    "CB_VOA_OBSOLESCENCE, different table)",
  { scales: {} }
);

const CB_P9_TABLES = {
  CB_VOA_FEE_SCALE,
  CB_VOA_FEE_BUILDING_TYPE_ADDERS,
  CB_LOCATION_FACTORS,
  CB_PRICE_SOURCES,
  CB_CONTRACT_SIZE_ADJUSTMENT,
  CB_VOA_OBSOLESCENCE,
  CB_CIBSE_PLANT_LIVES,
  CB_VOA_BUILDING_OBSOLESCENCE
};

/* N4 (Phase 132, 14 September 2026). A key a job states is KNOWN only if it is
   a non-empty string that is not one of the ways a form records "I don't know".
   "unsure" and an absent value are the same fact - nothing was stated - and
   must reach the same refusal. Without this, "unsure" is looked up as if it
   were a region name and fails with a different code from an absent key,
   which is two behaviours for one fact. */
const NOT_KNOWN_MARKERS = ["unsure", "not sure", "unknown", "not known", "don't know", "dont know"];
function statedKey(v) {
  return typeof v === "string" && v.trim() !== "" &&
         NOT_KNOWN_MARKERS.indexOf(v.trim().toLowerCase()) === -1;
}
function notStated(v) {
  return v === undefined || v === null ||
         (typeof v === "string" && (v.trim() === "" ||
           NOT_KNOWN_MARKERS.indexOf(v.trim().toLowerCase()) !== -1));
}

/* A table is usable only if something has explicitly loaded it. Tests inject
   hand-built fixtures through opts.tables to prove the MECHANISM without any
   real licensed content ever entering this repository. */
function requireTable(opts, id, gateName) {
  const t = (opts && opts.tables && opts.tables[id]) || CB_P9_TABLES[id];
  if (!t) fail("E_UNKNOWN_TABLE", "no such table: " + id, { table: id });
  if (!t.loaded) {
    fail("E_TABLE_NOT_LOADED",
      "gate " + gateName + " is on but " + id + " is an empty stub. " +
      "Load it, or turn the gate off. It will not guess.",
      { table: id, gate: gateName, licence: t.licence });
  }
  return t;
}

/* EXPORTED SINCE PHASE 110, and the reason is worth a line. The wiring in
   caprebate-location-key.ts has to know whether LEG-E4 is on before it decides
   whether a missing location_key is a refusal or simply irrelevant. It could
   have read CB_P9_GATES directly - and would then have missed the opts.gates
   override below, which is how every test in this project forces a gate on.
   A second copy of a three-line rule is still a second copy. */
function gateOn(name, opts) {
  if (opts && opts.gates && Object.prototype.hasOwnProperty.call(opts.gates, name)) {
    return opts.gates[name] === true;
  }
  return CB_P9_GATES[name] === true;
}

/* Look a value up in [floor, ceiling, value] bands. ceiling null = open top.
   Bands are half-open [floor, ceiling) so a value on a boundary lands in
   exactly one band and the total is not double counted. */
function bandLookup(bands, value, what) {
  for (const b of bands) {
    const lo = b[0], hi = b[1];
    if (value >= lo && (hi === null || hi === undefined || value < hi)) return b[2];
  }
  fail("E_BAND_NOT_FOUND", "no band covers " + what + " = " + value, { value: value });
}

/* --------------------------------------------- percentages and scales -- */
/* A price book publishes an adjustment as a PERCENTAGE - "-5%", "+3%". The
   model multiplies by a FACTOR. The two are one line apart and loading one
   where the other is expected is silent: -5 read as a factor scales every cost
   by minus five and still produces a number. This is the only place the
   conversion happens, so there is one place to be wrong. */
function percentageAdjustmentToFactor(pct, what) {
  what = what || "adjustment";
  if (typeof pct !== "number" || !isFinite(pct)) {
    fail("E_PERCENTAGE_INVALID", what + " percentage must be a finite number",
      { given: pct });
  }
  if (pct <= -100) {
    fail("E_PERCENTAGE_OUT_OF_RANGE",
      what + " percentage of " + pct + "% would zero or invert a cost. A " +
      "published adjustment is never that; this is a units error, not a datum.",
      { given: pct });
  }
  return 1 + pct / 100;
}

/* Linear interpolation across a published, tabulated scale, with the
   publisher's own validity window enforced as a REFUSAL.

   WHY NOT bandLookup. A banded lookup is right for a scale the source itself
   publishes as bands - the VOA professional fee scale is one, where every
   contract in a band genuinely carries the same rate. It is wrong for a scale
   the source publishes as points on a curve, because it invents a step the
   publisher did not draw and makes two near-identical jobs diverge at the edge.

   WHY IT REFUSES OFF THE ENDS. Interpolation stays inside data the publisher
   stands behind. Extrapolation is us continuing their line for them. Where the
   book states a validity range, outside it there is no published adjustment at
   all - so this throws, exactly as an unlisted location throws rather than
   falling back to the mean. Unknown is not a branch.

   ONE OPTION, AND ITS DEFAULT IS THE REFUSAL (Phase 132, 14 September 2026).
   options.outside is "refuse" (the default, and what every caller got before)
   or "hold_at_limit": outside the window, read the scale AT the nearer limit
   and say so in held_at_limit ("upper" | "lower"). That is still not
   extrapolation - no value is invented past the publisher's range - but it is
   a convention, and only the LEG-E4 contract-size caller may ask for it, and
   only behind leg_e4_contract_size_outside_window. An option this function
   does not recognise refuses rather than falling back to either behaviour.

   scale: { quoted_as, valid_from, valid_to, points: [[x, y], ...] } */
function interpolateScale(scale, value, what, options) {
  what = what || "value";
  const outside = (options && options.outside !== undefined) ? options.outside : "refuse";
  if (outside !== "refuse" && outside !== "hold_at_limit") {
    fail("E_SCALE_OUTSIDE_OPTION_INVALID",
      what + " scale: options.outside must be \"refuse\" or \"hold_at_limit\"",
      { given: outside });
  }
  if (!scale || !Array.isArray(scale.points)) {
    fail("E_SCALE_MALFORMED", what + " scale has no points array", {});
  }
  const pts = scale.points;
  if (pts.length < 2) {
    fail("E_SCALE_TOO_SHORT",
      "an interpolated scale needs at least two points; " + what + " has " +
      pts.length + ". One point is a constant, not a scale.",
      { points: pts.length });
  }
  const from = scale.valid_from, to = scale.valid_to;
  if (typeof from !== "number" || typeof to !== "number" || !isFinite(from) ||
      !isFinite(to) || !(from < to)) {
    fail("E_SCALE_VALIDITY_WINDOW_MISSING",
      "a loaded " + what + " scale must declare valid_from and valid_to as " +
      "numbers with valid_from < valid_to. Without the publisher's own range " +
      "there is nothing to say where the scale stops being their data.",
      { valid_from: from, valid_to: to });
  }
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (!Array.isArray(p) || p.length < 2 ||
        typeof p[0] !== "number" || !isFinite(p[0]) ||
        typeof p[1] !== "number" || !isFinite(p[1])) {
      fail("E_SCALE_POINT_INVALID",
        what + " scale point " + i + " must be [number, number]", { index: i, point: p });
    }
    if (i > 0 && !(p[0] > pts[i - 1][0])) {
      fail("E_SCALE_NOT_ASCENDING",
        what + " scale points must ascend strictly on the first coordinate; " +
        "point " + i + " does not. A repeated or reversed x makes the " +
        "interpolation ambiguous rather than wrong, which is worse.",
        { index: i });
    }
    if (p[0] < from || p[0] > to) {
      fail("E_SCALE_POINT_OUTSIDE_WINDOW",
        what + " scale point " + i + " at " + p[0] + " lies outside the " +
        "declared validity window " + from + " to " + to,
        { index: i, valid_from: from, valid_to: to });
    }
  }
  if (typeof value !== "number" || !isFinite(value)) {
    fail("E_SCALE_INPUT_INVALID", what + " must be a finite number", { given: value });
  }
  let heldAt = null;
  let used = value;
  if (value < from || value > to) {
    if (outside === "refuse") {
      fail("E_SCALE_VALUE_OUT_OF_RANGE",
        what + " = " + value + " lies outside the published validity range " +
        from + " to " + to + ". Refusing to extrapolate: beyond the range the " +
        "source publishes no adjustment, and continuing its curve would be our " +
        "figure presented as theirs.",
        { value: value, valid_from: from, valid_to: to });
    }
    /* hold_at_limit: read the scale at the nearer end of the window. */
    heldAt = value > to ? "upper" : "lower";
    used = value > to ? to : from;
  }

  let published;
  if (used <= pts[0][0]) {
    published = pts[0][1];
  } else if (used >= pts[pts.length - 1][0]) {
    published = pts[pts.length - 1][1];
  } else {
    let lo = pts[0];
    let hi = pts[pts.length - 1];
    for (let i = 1; i < pts.length; i++) {
      if (pts[i][0] >= used) { lo = pts[i - 1]; hi = pts[i]; break; }
    }
    const span = hi[0] - lo[0];
    published = lo[1] + (hi[1] - lo[1]) * ((used - lo[0]) / span);
  }

  const quoted = scale.quoted_as;
  if (quoted === "percentage_adjustment") {
    return { factor: percentageAdjustmentToFactor(published, what), published: published,
             quoted_as: quoted, held_at_limit: heldAt, value_used: used };
  }
  if (quoted === "factor") {
    if (!(published > 0)) {
      fail("E_SCALE_FACTOR_INVALID",
        what + " interpolated to a factor of " + published + "; a cost factor " +
        "must be positive", { factor: published });
    }
    return { factor: published, published: published, quoted_as: quoted,
             held_at_limit: heldAt, value_used: used };
  }
  fail("E_SCALE_QUOTED_AS_MISSING",
    "a loaded " + what + " scale must declare quoted_as as " +
    "\"percentage_adjustment\" or \"factor\". A percentage loaded into a " +
    "factor slot multiplies every cost by roughly minus five and still returns " +
    "a number, so this is never defaulted.",
    { given: quoted });
}

/* ============================================================================
   LEG-E2 - PRELIMINARIES
   ============================================================================
   THE DEFECT. Specification section 4.2 builds both replacement-cost components
   as

       A = sum(qty x rate x (1 + prelims) x (1 + fees) x index)
       B = nonqual_rate_per_m2 x area x (1 + prelims) x (1 + fees) x index

   with prelims defaulting to 0.18. VOA guidance on estimated replacement cost
   is that on-costs - site set-up, scaffolding, plant hire, site management,
   insurances - are ALREADY INSIDE the estimated replacement cost. Multiplying
   by a further 1.18 counts them twice, and it inflates A and B together.

   WHY THE SIZE OF THE ERROR IS NOT 18%. The residual model divides:
   m = PC / (A + B + C). A common uplift on A and B partly cancels in the ratio
   m x A. It does not cancel completely, because C - bare-site land value - is
   not uplifted. So the double count shifts value from land into buildings and
   plant, and the qualifying figure moves by materially less than 18%. It still
   moves, always in the direction of OVERSTATING the claim, and it moves most on
   the properties with the highest land fraction. Overstatement is the direction
   that loses an enquiry.

   ------------------------------------------------------------------------
   IS THIS ACTUALLY LICENCE-GATED? A QUESTION FOR LAKHBIR, NOT A DECISION.

   The board marks this blocked on VOA licence clearance. Reading the change
   itself: turning this gate on sets a multiplier to 1.0 and deletes a
   parameter. It reproduces no VOA table, quotes no VOA figure, and needs no
   VOA data to compute. The only VOA-derived thing involved is the KNOWLEDGE
   that on-costs sit inside ERC - and that knowledge is what tells us our own
   arithmetic counts them twice.

   Knowing a double count exists is not the same as republishing the data that
   revealed it. On that reading this looks over-blocked, and it is the one fix
   of the four that could ship on its own.

   Two arguments the other way, which is why this is a question and not a
   conclusion. First, if the licence terms restrict DERIVED WORKS rather than
   reproduction, a model shaped by VOA methodology may be caught even where no
   VOA number appears in it. Second, E2 and E3 touch the same expression: ship
   E2 alone and A and B carry a corrected prelims term beside an uncorrected
   flat 15% fee term, which is a defensible interim but is a state someone has
   to be told about rather than discover.

   NOT UNBLOCKED HERE. The gate is false like the others. Flagged for decision.
   ------------------------------------------------------------------------

   DO NOT "TIDY" THIS INTO THE FIT-OUT PATH. There is a trap here and it has
   caught people before. JD Wetherspoon plc v HMRC [2012] UKUT 42 holds that
   preliminaries and professional fees DO apportion to qualifying plant and
   machinery, pro rata, on an invoice-based claim - and that they are routinely
   missed, which understates claims. Module-00-Master-Engine-Specification.md
   line 104 says exactly that.

   Wetherspoon and LEG-E2 are not in conflict. They are about different paths:

     INVOICE / FIT-OUT path     real prelims and fees appear as their own lines
                                in a cost package. Wetherspoon says apportion
                                them to qualifying P&M rather than dropping
                                them. ADD.
     RESIDUAL / VALUATION path  the price-book rate already contains on-costs.
                                Adding a further uplift double counts.
                                DO NOT ADD.

   Same words, opposite treatment, because one is a real invoiced cost being
   allocated and the other is a modelled cost already inclusive. LEG-E2 changes
   the residual path ONLY. Anyone applying it to the invoice path would
   understate every fit-out claim and would be reversing Wetherspoon. Hence
   costBasis below, which must be stated and is never defaulted.

   ------------------------------------------------------------------------
   PHASE 132, 14 SEPTEMBER 2026 - ON-COSTS ARE A FACT ABOUT THE BOOK.
   "There is no parameter anywhere for whether the unit rate is on-cost-
   inclusive" (4 September). The residual-path argument above holds for a
   replacement-cost rate that already includes on-costs. It does NOT hold for
   an element rate that excludes them - there, adding preliminaries once is
   right and dropping them understates. leg_e2_drop_prelims_from_erc cannot
   tell the two apart; it drops prelims on every residual job. So a second,
   alternative gate, leg_e2_oncosts_by_price_source, reads the answer off the
   job's named price book (CB_PRICE_SOURCES[price_source].rates_include_oncosts):
     true    factor 1, flag LEG_E2_ONCOSTS_IN_RATES
     false   1 + preliminaries, today's figure, flag LEG_E2_ONCOSTS_EXCLUDED_BY_SOURCE
     null, "unsure" or absent   E_ONCOSTS_BASIS_UNKNOWN - never defaulted either way
   An unnamed or unlisted book refuses with E_PRICE_SOURCE_REQUIRED. Both
   leg_e2 gates on refuses with E_GATE_CONFLICT, the same interlock shape as the
   fee gates. The invoice path is untouched by either gate.
   ------------------------------------------------------------------------
   ============================================================================ */

/* The price-book entry a job names, or a refusal. An absent name and one
   recorded as not known produce the same error with the same detail (N4). */
function resolvePriceSource(priceSource, opts, gateName) {
  if (!statedKey(priceSource)) {
    fail("E_PRICE_SOURCE_REQUIRED",
      "gate " + gateName + " is on, so the job must name its price_source - the " +
      "price book its unit rates came from. Refusing to assume one.",
      { gate: gateName, reason: "not_stated" });
  }
  const table = requireTable(opts, "CB_PRICE_SOURCES", gateName);
  const sources = table.sources || {};
  const entry = Object.prototype.hasOwnProperty.call(sources, priceSource)
    ? sources[priceSource] : undefined;
  if (!entry || typeof entry !== "object") {
    fail("E_PRICE_SOURCE_REQUIRED",
      "price_source '" + priceSource + "' is not listed in CB_PRICE_SOURCES. An " +
      "unlisted book is a question, not a default.",
      { gate: gateName, reason: "not_listed", price_source: priceSource });
  }
  return { id: priceSource, entry: entry, table: table };
}

const COST_BASIS = { RESIDUAL: "residual_replacement_cost", INVOICE: "invoice_cost_package" };

const SPEC_PRELIMS_DEFAULT = 0.18;   /* spec 4.2. No source cited - register R-B9. */
const SPEC_FEES_DEFAULT    = 0.15;   /* spec 4.2. No source cited - register R-B9. */

function prelimsFactor(input, opts) {
  opts = opts || {};
  const basis = input && input.cost_basis;
  if (basis !== COST_BASIS.RESIDUAL && basis !== COST_BASIS.INVOICE) {
    fail("E_COST_BASIS_REQUIRED",
      "cost_basis must be stated as '" + COST_BASIS.RESIDUAL + "' or '" +
      COST_BASIS.INVOICE + "'. Preliminaries are treated in opposite directions " +
      "on the two paths (JD Wetherspoon [2012] UKUT 42 on the invoice path; " +
      "VOA on-costs-already-in-ERC on the residual path) and this must never " +
      "be defaulted.",
      { given: basis });
  }

  /* The invoice path is untouched by LEG-E2 whatever the gate says. */
  if (basis === COST_BASIS.INVOICE) {
    const rate = (input.prelims_rate === undefined || input.prelims_rate === null)
      ? SPEC_PRELIMS_DEFAULT : input.prelims_rate;
    return {
      factor: 1 + rate,
      rate: rate,
      basis: basis,
      applied: true,
      authority: "JD Wetherspoon plc v HMRC [2012] UKUT 42 - preliminaries and " +
                 "professional fees apportion to qualifying P&M",
      flags: []
    };
  }

  const dropOn = gateOn("leg_e2_drop_prelims_from_erc", opts);
  const bySourceOn = gateOn("leg_e2_oncosts_by_price_source", opts);

  /* PHASE 132. THE TWO leg_e2 GATES ARE ALTERNATIVES, NOT LAYERS. One drops
     prelims on every residual job; the other decides per price book. Both on
     means nobody has decided which rule governs - refused, as the fee gates
     refuse when only one of their pair is on. */
  if (dropOn && bySourceOn) {
    fail("E_GATE_CONFLICT",
      "leg_e2_drop_prelims_from_erc and leg_e2_oncosts_by_price_source are both " +
      "on. The first drops preliminaries on every residual job; the second drops " +
      "them only where the price book's rates already carry on-costs. Turn one " +
      "of them on, not both.",
      { gates: ["leg_e2_drop_prelims_from_erc", "leg_e2_oncosts_by_price_source"] });
  }

  if (bySourceOn) {
    const src = resolvePriceSource(input.price_source, opts, "leg_e2_oncosts_by_price_source");
    const includes = src.entry.rates_include_oncosts;
    if (includes === true) {
      return {
        factor: 1,
        rate: 0,
        basis: basis,
        applied: false,
        price_source: src.id,
        rates_include_oncosts: true,
        authority: "price source '" + src.id + "' (" + (src.entry.label || "no label") +
                   ", " + src.table.source + ") records that its unit rates already " +
                   "include site on-costs; a further preliminaries uplift would count " +
                   "them twice (LEG-E2, Phase 132)",
        flags: ["LEG_E2_ONCOSTS_IN_RATES"]
      };
    }
    if (includes === false) {
      const rate = (input.prelims_rate === undefined || input.prelims_rate === null)
        ? SPEC_PRELIMS_DEFAULT : input.prelims_rate;
      return {
        factor: 1 + rate,
        rate: rate,
        basis: basis,
        applied: true,
        price_source: src.id,
        rates_include_oncosts: false,
        authority: "price source '" + src.id + "' (" + (src.entry.label || "no label") +
                   ", " + src.table.source + ") records that its unit rates EXCLUDE " +
                   "site on-costs, so preliminaries are added once at " + rate +
                   (rate === SPEC_PRELIMS_DEFAULT
                     ? " - spec 4.2 default, NO SOURCE CITED (register R-B9)" : ""),
        flags: ["LEG_E2_ONCOSTS_EXCLUDED_BY_SOURCE"]
      };
    }
    /* null, "unsure", absent, or anything that is not a boolean: the same fact,
       the same refusal, the same detail (N4). */
    fail("E_ONCOSTS_BASIS_UNKNOWN",
      "price source '" + src.id + "' does not record whether its unit rates include " +
      "site on-costs. Dropping preliminaries on a book that excludes them " +
      "understates the claim; adding them on a book that includes them " +
      "overstates it. Read the book's preamble and record true or false - this " +
      "is never defaulted either way.",
      { price_source: src.id, gate: "leg_e2_oncosts_by_price_source" });
  }

  if (!dropOn) {
    const rate = (input.prelims_rate === undefined || input.prelims_rate === null)
      ? SPEC_PRELIMS_DEFAULT : input.prelims_rate;
    return {
      factor: 1 + rate,
      rate: rate,
      basis: basis,
      applied: true,
      authority: "spec 4.2 default 0.18 - NO SOURCE CITED (register R-B9)",
      flags: ["LEG_E2_DOUBLE_COUNT_PRESENT"]
    };
  }

  /* Gate on. No table. The fix is the removal. */
  return {
    factor: 1,
    rate: 0,
    basis: basis,
    applied: false,
    authority: "VOA - on-costs are already inside the estimated replacement " +
               "cost; a further uplift double counts them (LEG-E2)",
    flags: ["LEG_E2_APPLIED"]
  };
}

/* ============================================================================
   LEG-E3 - PROFESSIONAL FEES
   ============================================================================
   THE DEFECT. Spec 4.2 applies a flat 15% professional fee uplift to every
   line of A and B regardless of contract size. Register R-B9 records that the
   0.15 carries no cited source and may have been back-solved to reproduce the
   GC-01 golden case. A flat rate is wrong in shape as well as in level: fee
   scales are REGRESSIVE - the percentage falls as the contract grows - so a
   flat rate understates fees on small jobs and overstates them on large ones.
   The error therefore does not wash out across a portfolio; it is signed by
   job size.

   THE FIX. Apply the VOA banded fee scale to the construction cost.

   GENUINELY LICENCE-GATED, unlike LEG-E2. The band table IS the VOA data. There
   is no version of this fix that does not reproduce a VOA schedule, because the
   schedule is the whole content of the change. The mechanism below is complete
   and tested; CB_VOA_FEE_SCALE.bands is empty and stays empty until the licence
   lands.

   CITATION, and why it is not a contradiction. JD Wetherspoon plc v HMRC [2012]
   UKUT 42 is the authority that professional fees reach qualifying plant and
   machinery at all - they apportion to qualifying P&M pro rata and are
   routinely missed, which understates claims. Wetherspoon settles WHETHER fees
   qualify. It says nothing about HOW MUCH the fees were. LEG-E3 changes only
   the quantum on the residual path, where the figure is modelled rather than
   invoiced. On the invoice path the fee quantum comes off the invoice and no
   scale is involved. See the prelimsFactor note - the same two-path split.
   ============================================================================ */

function feesFactor(input, opts) {
  opts = opts || {};
  const basis = input && input.cost_basis;
  if (basis !== COST_BASIS.RESIDUAL && basis !== COST_BASIS.INVOICE) {
    fail("E_COST_BASIS_REQUIRED", "cost_basis must be stated for the fee treatment",
      { given: basis });
  }

  if (basis === COST_BASIS.INVOICE) {
    const rate = (input.fees_rate === undefined || input.fees_rate === null)
      ? SPEC_FEES_DEFAULT : input.fees_rate;
    return {
      factor: 1 + rate, rate: rate, basis: basis, banded: false,
      authority: "JD Wetherspoon plc v HMRC [2012] UKUT 42 - professional fees " +
                 "apportion to qualifying P&M; quantum taken from the invoice",
      flags: []
    };
  }

  if (!gateOn("leg_e3_voa_fee_scale", opts)) {
    const rate = (input.fees_rate === undefined || input.fees_rate === null)
      ? SPEC_FEES_DEFAULT : input.fees_rate;
    return {
      factor: 1 + rate, rate: rate, basis: basis, banded: false,
      authority: "spec 4.2 flat default 0.15 - NO SOURCE CITED (register R-B9)",
      flags: ["LEG_E3_FLAT_FEE_PRESENT"]
    };
  }

  const cost = input.construction_cost;
  if (typeof cost !== "number" || !isFinite(cost) || cost < 0) {
    fail("E_CONSTRUCTION_COST_REQUIRED",
      "the VOA fee scale is banded on construction cost, so construction_cost " +
      "is required once leg_e3_voa_fee_scale is on", { given: cost });
  }
  const table = requireTable(opts, "CB_VOA_FEE_SCALE", "leg_e3_voa_fee_scale");
  const baseRate = bandLookup(table.bands, cost, "construction_cost");

  /* F-1 (Phase 129). The base bands alone under-read fees on every healthcare
     property, so once the base scale is live the adder is not optional: both
     gates on together, never one without the other. */
  if (!gateOn("leg_e3_building_type_adder", opts)) {
    fail("E_BUILDING_TYPE_ADDER_REQUIRED",
      "leg_e3_voa_fee_scale is on but leg_e3_building_type_adder is not. The " +
      "base bands alone under-read fees on every healthcare property (F-1) - " +
      "turn both gates on together.",
      { gate: "leg_e3_building_type_adder" });
  }
  const buildingType = input.building_type;
  if (buildingType !== BUILDING_TYPE.STANDARD && buildingType !== BUILDING_TYPE.HIGHLY_SERVICED &&
      buildingType !== BUILDING_TYPE.HOSPITAL) {
    fail("E_BUILDING_TYPE_REQUIRED",
      "building_type must be 'standard', 'highly_serviced' or 'hospital' once the " +
      "adder gate is on. Refusing to default it.", { given: buildingType });
  }
  const adderTable = requireTable(opts, "CB_VOA_FEE_BUILDING_TYPE_ADDERS", "leg_e3_building_type_adder");
  const adderRate = adderTable.adders[buildingType];
  if (typeof adderRate !== "number" || !isFinite(adderRate)) {
    fail("E_UNKNOWN_BUILDING_TYPE",
      "no adder on file for building_type '" + buildingType + "'",
      { building_type: buildingType });
  }
  const rate = baseRate + adderRate;
  return {
    factor: 1 + rate, rate: rate, basis: basis, banded: true,
    base_rate: baseRate, adder_rate: adderRate, building_type: buildingType,
    band_source: table.source, band_verified_at: table.verified_at,
    adder_source: adderTable.source, adder_verified_at: adderTable.verified_at,
    authority: "VOA professional fee scale, banded on construction cost (" +
               table.source + "), plus a " + buildingType + " adder (" +
               adderTable.source + "), cited separately (F-1). " +
               "Fees reach qualifying P&M per JD Wetherspoon plc v HMRC " +
               "[2012] UKUT 42; this changes the quantum, not the principle.",
    flags: ["LEG_E3_APPLIED", "LEG_E3_BUILDING_TYPE_ADDER_APPLIED"]
  };
}

/* ============================================================================
   LEG-E4 - LOCATION FACTOR AND CONTRACT SIZE ADJUSTMENT
   ============================================================================
   THE DEFECT. Rates are applied nationally. A national mean rate applied to a
   property in a cheaper region overstates replacement cost, and to a property
   in a dearer region understates it. The board's example: Cardiff sits at 94
   against a mean of 100, so a national rate overstates Cardiff replacement cost
   by roughly 6%. Contract size bites the same way - price books quote at an
   assumed contract value and a much larger or smaller job does not carry those
   unit rates.

   NOT A LICENCE PROBLEM. This one is blocked on a PURCHASE - Spon's or BCIS,
   board item 12804374406, about GBP 330. That is a different kind of block: no
   solicitor, no clearance, no negotiation. Someone buys a book. Worth
   separating on the board, because it can be cleared this week by anyone with
   a card, whereas the VOA items cannot be cleared by us at all.

   WHERE IT LANDS, AND THE SOURCE IS EXPLICIT ABOUT THIS. Spon's Architects' and
   Builders' Price Book states of its own location and contract-size adjustments
   that they "need to be applied to the total cost plan value, not to individual
   material or element items", and "should be applied to the whole project and
   not just to individual elements or materials". So the pair is ONE adjustment
   made ONCE, to the summed cost plan - never a column on an element line.

   THIS IS A CORRECTION, MADE 7 SEPTEMBER 2026 (Phase 97). Until then this
   module multiplied loc.factor into every element inside the costing loop, and
   the specification's worked example printed "Cardiff 94" in the source column
   of five separate element rows. The ARITHMETIC was not wrong - one factor,
   uniform across every element, distributes out of the sum - but the SHAPE was
   exactly the shape the source forbids, and it is the shape that fails when
   anyone adds a per-element override. residualApportionment now sums the
   element lines UNADJUSTED, applies the factor once to that total, and asserts
   the tie-back so "applied once" is machine-checked rather than commented.

   ORDER STILL MATTERS. location x contract_size, both multiplicative, applied
   BEFORE indexation and before prelims/fees - i.e. to the construction cost
   total, not to a figure that already carries an uplift. Applying them after an
   uplift compounds the uplift by a regional factor, which is not what either
   adjustment means. The order is asserted in the tests so a later refactor
   cannot quietly transpose it.

   THE INDEX BASE WAS A SEPARATE DEFECT, AND PHASE 97 DID NOT FIX IT. The
   comment on CB_LOCATION_FACTORS said "mean 100"; Spon's is indexed to Outer
   London = 1.00 and the Mechanical and Electrical book uses a third base again.
   Fixing WHERE the factor is applied is independent of fixing WHAT the factor
   is indexed to, and Phase 97 did the first only.

   FIXED 14 SEPTEMBER 2026 (Phase 132), under this same gate - no new gate,
   because the gate was never on and the old arithmetic never reached a figure.
   The factor is no longer raw / mean. It is

       factors[location_key] / factors[rates_priced_at_key]

   both read from the ONE location table, where rates_priced_at_key is declared
   by the job's price book (CB_PRICE_SOURCES) - the row the book's unit rates
   are priced at. On a national-mean table with rates priced at the mean that
   is Cardiff 94 / 100 = 0.94, as before. On an Outer-London table with rates
   priced at Outer London it is the raw factor itself. On any table with rates
   priced somewhere else it moves the rates from where they were priced to
   where the property is, which dividing by a mean never did. Refusals:
     E_LOCATION_MEAN_DEPRECATED       a loaded table still carrying a bare mean
     E_LOCATION_INDEX_BASE_MISSING    no well-formed index_base declared
     E_LOCATION_BASE_NOT_IN_TABLE     factors[base_key] !== base_value
     E_PRICE_SOURCE_REQUIRED          no price_source, or one not listed
     E_LOCATION_INDEX_BASE_MISMATCH   the table and the rates are from different
                                      books, or declare different bases
     E_RATES_PRICING_LOCATION_MISSING the book does not say where its rates are priced

   AND AN ABSENT CONTRACT VALUE IS NO LONGER A PASS (Phase 132, N4). Until this
   date a job with no contract_value took a contract-size factor of 1 and a
   flag (LEG_E4_NO_CONTRACT_SIZE) - "not stated" became "exactly the book's
   assumed size". With the gate on, an absent contract value and one recorded
   as not known now both refuse with E_CONTRACT_VALUE_REQUIRED.
   ============================================================================ */

function indexBaseWellFormed(b) {
  return !!b && typeof b === "object" &&
    (b.basis === INDEX_BASIS.OUTER_LONDON || b.basis === INDEX_BASIS.NATIONAL_MEAN ||
     b.basis === INDEX_BASIS.PUBLISHER_OTHER) &&
    statedKey(b.base_key) &&
    typeof b.base_value === "number" && isFinite(b.base_value) && b.base_value > 0;
}

function locationIndexAt(factors, key) {
  if (!factors || !Object.prototype.hasOwnProperty.call(factors, key)) return undefined;
  const v = factors[key];
  return (typeof v === "number" && isFinite(v) && v > 0) ? v : undefined;
}

function locationAndContractSizeFactor(input, opts) {
  opts = opts || {};
  if (!gateOn("leg_e4_location_and_contract_size", opts)) {
    return {
      factor: 1, location_factor: 1, contract_size_factor: 1, applied: false,
      contract_size_applied: false, applies_to: "total_cost_plan_value",
      authority: "national mean rates, unadjusted - LEG-E4 not applied",
      flags: ["LEG_E4_NO_REGIONAL_ADJUSTMENT"]
    };
  }

  const GATE = "leg_e4_location_and_contract_size";
  const region = input && input.location_key;
  /* N4: absent and "unsure" are one fact - the same code, the same detail. */
  if (!statedKey(region)) {
    fail("E_LOCATION_KEY_REQUIRED",
      "leg_e4_location_and_contract_size is on, so a location_key is required " +
      "(the region or postcode area the factor table is keyed on). A key " +
      "recorded as not known is the same as no key, and neither is a 1.0.", {});
  }
  const locTable = requireTable(opts, "CB_LOCATION_FACTORS", GATE);

  /* PHASE 132. The bare mean is gone; a table still carrying one refuses rather
     than being divided by it. */
  if (locTable.mean !== undefined && locTable.mean !== null) {
    fail("E_LOCATION_MEAN_DEPRECATED",
      "the location table still carries a bare mean (" + locTable.mean + "). Since " +
      "Phase 132 a location factor is not raw / mean: the table must declare its " +
      "index_base and price_source, and the factor moves rates from where the " +
      "price book priced them to where the property is. Remove mean and declare " +
      "the base.",
      { table: "CB_LOCATION_FACTORS", mean: locTable.mean });
  }
  const base = locTable.index_base;
  if (!indexBaseWellFormed(base)) {
    fail("E_LOCATION_INDEX_BASE_MISSING",
      "the location table must declare index_base as { basis: 'outer_london' | " +
      "'national_mean' | 'publisher_other', base_key, base_value }. Spon's is " +
      "indexed to Outer London = 1.00, other books to a national mean of 100; " +
      "reading one as the other is out by a factor of a hundred and still " +
      "returns a number.",
      { table: "CB_LOCATION_FACTORS", declared_by: "location_table",
        given: base === undefined ? null : base });
  }
  const factors = locTable.factors || {};
  if (!Object.prototype.hasOwnProperty.call(factors, base.base_key) ||
      factors[base.base_key] !== base.base_value) {
    fail("E_LOCATION_BASE_NOT_IN_TABLE",
      "the location table declares its base as '" + base.base_key + "' = " +
      base.base_value + " but its factors hold " +
      (Object.prototype.hasOwnProperty.call(factors, base.base_key)
        ? factors[base.base_key] : "no such row") +
      ". A declared base the table does not contain is a transcription error.",
      { base_key: base.base_key, base_value: base.base_value,
        in_table: Object.prototype.hasOwnProperty.call(factors, base.base_key)
          ? factors[base.base_key] : null });
  }
  const raw = locationIndexAt(factors, region);
  if (raw === undefined) {
    fail("E_LOCATION_NOT_IN_TABLE",
      "no location factor for '" + region + "'. Refusing to fall back to the " +
      "base - an unlisted region is a question, not a 1.0.",
      { location_key: region });
  }

  const src = resolvePriceSource(input.price_source, opts, GATE);
  if (locTable.price_source !== src.id) {
    fail("E_LOCATION_INDEX_BASE_MISMATCH",
      "the location table was published with price source '" + locTable.price_source +
      "' but the job's rates come from '" + src.id + "'. A factor from one book " +
      "moving rates from another is two bases pretending to be one.",
      { reason: "different_source", table_price_source: locTable.price_source,
        rates_price_source: src.id });
  }
  const srcBase = src.entry.index_base;
  if (!indexBaseWellFormed(srcBase)) {
    fail("E_LOCATION_INDEX_BASE_MISSING",
      "price source '" + src.id + "' does not declare the index_base its location " +
      "table uses, so nothing confirms the table and the rates share one.",
      { declared_by: "price_source", price_source: src.id,
        given: srcBase === undefined ? null : srcBase });
  }
  if (srcBase.basis !== base.basis || srcBase.base_key !== base.base_key ||
      srcBase.base_value !== base.base_value) {
    fail("E_LOCATION_INDEX_BASE_MISMATCH",
      "price source '" + src.id + "' declares index base " + JSON.stringify(srcBase) +
      " but the location table declares " + JSON.stringify(base) + ".",
      { reason: "different_base", table_index_base: base, rates_index_base: srcBase });
  }
  const pricedAt = src.entry.rates_priced_at_key;
  if (!statedKey(pricedAt)) {
    fail("E_RATES_PRICING_LOCATION_MISSING",
      "price source '" + src.id + "' does not record where its unit rates are " +
      "priced (rates_priced_at_key). Without it there is nothing to move the rates " +
      "off, and dividing by the base instead is the defect this replaced.",
      { price_source: src.id });
  }
  const pricedAtIndex = locationIndexAt(factors, pricedAt);
  if (pricedAtIndex === undefined) {
    fail("E_LOCATION_NOT_IN_TABLE",
      "price source '" + src.id + "' prices its rates at '" + pricedAt + "', which " +
      "the location table does not hold.",
      { rates_priced_at_key: pricedAt, price_source: src.id });
  }
  const locationFactor = raw / pricedAtIndex;

  /* PHASE 132, N4. A contract value is required once the gate is on. An absent
     one and one recorded as not known refuse identically; neither is the book's
     assumed contract size. */
  const value = input.contract_value;
  if (notStated(value)) {
    fail("E_CONTRACT_VALUE_REQUIRED",
      "leg_e4_location_and_contract_size is on, so contract_value is required. A " +
      "contract value recorded as not known is the same as none, and neither is " +
      "a contract-size factor of 1.", {});
  }
  if (typeof value !== "number" || !isFinite(value) || value < 0) {
    fail("E_CONTRACT_VALUE_INVALID", "contract_value must be a non-negative number",
      { given: value });
  }
  const sizeTable = requireTable(opts, "CB_CONTRACT_SIZE_ADJUSTMENT", GATE);
  if (typeof sizeTable.assumed_contract_value !== "number" ||
      !isFinite(sizeTable.assumed_contract_value)) {
    fail("E_CONTRACT_ASSUMED_VALUE_MISSING",
      "the contract size scale must state the contract value its unit rates " +
      "are quoted at. Without it the adjustment has no base to move off.",
      { given: sizeTable.assumed_contract_value });
  }
  /* Off: throws E_SCALE_VALUE_OUT_OF_RANGE outside the book's stated window
     rather than extrapolating - see interpolateScale. On (Phase 132, waits on
     the surveyor): held at the nearer limit and flagged with the direction of
     the error. */
  const outsideOn = gateOn("leg_e4_contract_size_outside_window", opts);
  const contractScale = interpolateScale(sizeTable, value, "contract_value",
    { outside: outsideOn ? "hold_at_limit" : "refuse" });
  const contractFactor = contractScale.factor;

  const flags = ["LEG_E4_APPLIED", "LEG_E4_APPLIED_TO_TOTAL"];
  let limitMessage = null;
  if (contractScale.held_at_limit === "upper") {
    flags.push("LEG_E4_CONTRACT_SIZE_HELD_AT_UPPER_LIMIT");
    limitMessage = "contract value " + value + " is above the price book's contract-size " +
      "window, which ends at " + sizeTable.valid_to + "; the adjustment is held at its " +
      sizeTable.valid_to + " value. This OVERSTATES cost: larger contracts carry lower " +
      "unit rates, so the true adjustment would be lower still.";
  } else if (contractScale.held_at_limit === "lower") {
    flags.push("LEG_E4_CONTRACT_SIZE_HELD_AT_LOWER_LIMIT");
    limitMessage = "contract value " + value + " is below the price book's contract-size " +
      "window, which starts at " + sizeTable.valid_from + "; the adjustment is held at its " +
      sizeTable.valid_from + " value. This UNDERSTATES cost: smaller contracts carry " +
      "higher unit rates, so the true adjustment would be higher still.";
  }

  return {
    factor: locationFactor * contractFactor,
    location_factor: locationFactor,
    contract_size_factor: contractFactor,
    contract_size_published: contractScale.published,
    contract_size_quoted_as: contractScale.quoted_as,
    contract_size_interpolated: true,
    contract_size_held_at_limit: contractScale.held_at_limit,
    contract_size_value_used: contractScale.value_used,
    contract_size_limit_message: limitMessage,
    applied: true,
    contract_size_applied: true,
    location_key: region,
    price_source: src.id,
    index_base: { basis: base.basis, base_key: base.base_key, base_value: base.base_value },
    location_index: raw,
    rates_priced_at_key: pricedAt,
    rates_priced_at_index: pricedAtIndex,
    applies_to: "total_cost_plan_value",
    authority: "regional location factor (" + locTable.source + ", indexed to " +
               base.basis + " '" + base.base_key + "' = " + base.base_value + ") moving " +
               "rates priced at '" + pricedAt + "' to '" + region + "', x contract " +
               "size adjustment, interpolated across the published scale. " +
               "APPLIED ONCE TO THE TOTAL COST PLAN VALUE, before indexation " +
               "and before prelims and fees - never to an individual element " +
               "or material line, which the price book forbids in terms.",
    flags: flags
  };
}

/* ============================================================================
   LEG-E5 - PER-ELEMENT DEPRECIATION
   ============================================================================
   TWO SOURCES, TWO BLOCKS. This needs VOA obsolescence scales (licensed) AND
   CIBSE plant lives (a separate source on its own terms). Clearing the VOA
   licence does not unblock E5 on its own.

   WHY PER-ELEMENT AND NOT PER-BUILDING. A single building-wide depreciation
   factor is wrong for a capital allowances claim in a way that a valuer might
   not mind but a tax adviser must. Plant lives differ by an order of magnitude
   across the taxonomy - a lift, a boiler, a nurse-call system and the drainage
   under the slab do not age together. Depreciating the whole replacement cost
   at one rate moves value between the main pool, the special rate pool and the
   non-qualifying residual, and those three attract 14%, 6% and 3% (SBA)
   respectively. A pooling error is a permanent timing error, not a rounding
   one. So the factor is computed per element, on that element's own life.

   THE CHAIN.  age_years -> expected_life (CIBSE, per element)
               -> age_ratio -> obsolescence scale (VOA) -> surviving proportion.

   THE GUARD THAT MATTERS. An element older than its expected life does not
   depreciate to zero. It is still there, it still works, and a floor -
   residual value, the scrap-and-still-in-service floor - applies. Depreciating
   to zero would strip a working asset out of a claim entirely. The floor is
   taken from the scale, never assumed, and an age_ratio above 1 is clamped
   rather than extrapolated: extrapolating a scale beyond its last band is
   inventing data.
   ============================================================================ */

function elementDepreciationFactor(element, opts) {
  opts = opts || {};
  if (!gateOn("leg_e5_per_element_depreciation", opts)) {
    return {
      factor: 1, applied: false, element_ref: element && element.element_ref,
      authority: "replacement cost new, undepreciated - LEG-E5 not applied",
      flags: ["LEG_E5_NO_DEPRECIATION"]
    };
  }
  /* ATP-F-3 (Phase 129). Off by default, and off it does nothing. On, the whole
     crosswalk is checked before this element - or any element - is priced. */
  const crosswalkChecked = gateOn("leg_e5_crosswalk_completeness_gate", opts);
  if (crosswalkChecked) {
    assertCrosswalkComplete(opts.taxonomy_element_refs, opts);
    if (element && element.element_ref &&
        opts.taxonomy_element_refs.indexOf(element.element_ref) === -1) {
      fail("E_ELEMENT_NOT_IN_TAXONOMY",
        "element '" + element.element_ref + "' is not one of the taxonomy ids the " +
        "crosswalk was checked against, so the completeness check says nothing about it.",
        { element_ref: element.element_ref });
    }
  }
  if (!element || !element.element_ref) {
    fail("E_ELEMENT_REF_REQUIRED", "per-element depreciation needs an element_ref", {});
  }
  const age = element.age_years;
  if (typeof age !== "number" || !isFinite(age) || age < 0) {
    fail("E_ELEMENT_AGE_REQUIRED",
      "element " + element.element_ref + " needs a non-negative age_years",
      { element_ref: element.element_ref, given: age });
  }

  const lives = requireTable(opts, "CB_CIBSE_PLANT_LIVES", "leg_e5_per_element_depreciation");
  const life = lives.lives_years[element.element_ref];
  if (life === undefined) {
    fail("E_PLANT_LIFE_NOT_IN_TABLE",
      "no CIBSE expected life for element '" + element.element_ref + "'. " +
      "Refusing a default life - an unlisted element is a question.",
      { element_ref: element.element_ref });
  }
  if (!(life > 0)) {
    fail("E_PLANT_LIFE_INVALID", "expected life must be positive",
      { element_ref: element.element_ref, life: life });
  }

  const scales = requireTable(opts, "CB_VOA_OBSOLESCENCE", "leg_e5_per_element_depreciation");
  const scaleKey = element.obsolescence_scale || lives.default_scale || "default";
  const scale = scales.scales[scaleKey];
  if (scale === undefined) {
    fail("E_OBSOLESCENCE_SCALE_NOT_IN_TABLE",
      "no VOA obsolescence scale '" + scaleKey + "'",
      { element_ref: element.element_ref, scale: scaleKey });
  }

  const rawRatio = age / life;
  const ratio = Math.min(rawRatio, 1);       /* clamp, never extrapolate */
  const surviving = bandLookup(scale.bands, ratio, "age_ratio");

  const floor = (scale.residual_floor === undefined || scale.residual_floor === null)
    ? 0 : scale.residual_floor;
  const factor = Math.max(surviving, floor);

  const flags = ["LEG_E5_APPLIED"];
  if (rawRatio > 1) flags.push("ELEMENT_BEYOND_EXPECTED_LIFE");
  if (surviving < floor) flags.push("RESIDUAL_FLOOR_APPLIED");
  if (crosswalkChecked) flags.push("CROSSWALK_COMPLETENESS_CHECKED");

  return {
    factor: factor,
    applied: true,
    element_ref: element.element_ref,
    age_years: age,
    expected_life_years: life,
    age_ratio: ratio,
    age_ratio_raw: rawRatio,
    residual_floor: floor,
    scale: scaleKey,
    authority: "VOA obsolescence scale '" + scaleKey + "' over CIBSE expected " +
               "life " + life + "y (" + lives.source + ")",
    flags: flags
  };
}

/* ============================================================================
   ATP-F-3 - THE CIBSE-TO-TAXONOMY CROSSWALK COMPLETENESS CHECK (Phase 129)
   ============================================================================
   The load-time twin of E_PLANT_LIFE_NOT_IN_TABLE. Given every element id the
   fixture taxonomy can emit (Caprebate-Fixture-Taxonomy-v1.csv: 103 ids across
   nine prefixes on 12 September 2026 - the prepared patch of 29 August said 95
   across five; the file has grown since), it refuses unless the loaded CIBSE
   lives cover every one. Callable on its own as the pre-flip step; called by
   elementDepreciationFactor when leg_e5_crosswalk_completeness_gate is on.

   Corrected 13 September 2026 (Phase 129a): "nine prefixes" above is wrong.
   Counted by code with taxonomyElementRefs, the 103 ids sit under eight
   prefixes - the five sector ones (LS-CH, LS-DEN, LS-SL, LS-GP, LS-PH) and
   three that apply across sectors (LS-SR, LS-MP, LS-SBA).

   N4. A life that is ABSENT and a life recorded as NOT KNOWN are the same thing
   here. Neither is a pass, neither becomes 0, neither becomes a default life.
   Known means a finite number above zero; anything else is missing. An absent
   or empty taxonomy list refuses too, so the check cannot pass by having been
   given nothing to check.
   ============================================================================ */

function crosswalkLifeKnown(livesYears, ref) {
  if (!livesYears || !Object.prototype.hasOwnProperty.call(livesYears, ref)) return false;
  const life = livesYears[ref];
  return typeof life === "number" && isFinite(life) && life > 0;
}

function assertCrosswalkComplete(elementRefs, opts) {
  if (!Array.isArray(elementRefs) || elementRefs.length === 0) {
    fail("E_TAXONOMY_REFS_REQUIRED",
      "the crosswalk check needs the full list of element ids the fixture taxonomy " +
      "can emit. An absent or empty list is not a pass.",
      { given: Array.isArray(elementRefs) ? "empty" : "absent" });
  }
  const invalid = elementRefs.filter(r => typeof r !== "string" || r.trim() === "");
  if (invalid.length) {
    fail("E_TAXONOMY_REF_INVALID", "every taxonomy element id must be a non-empty string",
      { invalid: invalid });
  }
  const refs = elementRefs.filter((r, i) => elementRefs.indexOf(r) === i);
  const lives = requireTable(opts, "CB_CIBSE_PLANT_LIVES", "leg_e5_crosswalk_completeness_gate");
  const missing = refs.filter(ref => !crosswalkLifeKnown(lives.lives_years, ref));
  if (missing.length) {
    fail("E_CROSSWALK_INCOMPLETE",
      "the CIBSE-to-taxonomy crosswalk is missing " + missing.length + " of " +
      refs.length + " element ids the fixture taxonomy can emit. A partial crosswalk " +
      "throws mid-job (ATP-F-3) - do not turn leg_e5_per_element_depreciation on until " +
      "this list is empty.",
      { missing: missing, checked: refs.length });
  }
  return { complete: true, checked: refs.length };
}

/* One CSV line, quote-aware, so a comma inside a quoted notes field cannot
   shift a column. The taxonomy has no multi-line fields. */
function splitCsvLine(line) {
  const out = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { quoted = false; }
      } else { cur += c; }
    } else if (c === '"') { quoted = true; }
    else if (c === ",") { out.push(cur); cur = ""; }
    else { cur += c; }
  }
  out.push(cur);
  return out;
}

/* The element_id column of the fixture taxonomy. Refuses rather than returning
   an empty or partial list: no element_id column, no rows, a blank id or a
   repeated id are each an error. */
function taxonomyElementRefs(csvText) {
  if (typeof csvText !== "string") {
    fail("E_TAXONOMY_CSV_REQUIRED", "pass the taxonomy CSV as text", {});
  }
  const lines = csvText.replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim() !== "");
  if (lines.length < 2) {
    fail("E_TAXONOMY_CSV_EMPTY", "the taxonomy CSV has no data rows", {});
  }
  const col = splitCsvLine(lines[0]).map(h => h.trim()).indexOf("element_id");
  if (col === -1) {
    fail("E_TAXONOMY_CSV_NO_ELEMENT_ID", "the taxonomy CSV has no element_id column", {});
  }
  const refs = lines.slice(1).map(l => (splitCsvLine(l)[col] || "").trim());
  const blankRows = refs.map((r, i) => (r === "" ? i + 2 : 0)).filter(Boolean);
  if (blankRows.length) {
    fail("E_TAXONOMY_REF_INVALID", "blank element_id on CSV line(s) " + blankRows.join(", "),
      { lines: blankRows });
  }
  const repeated = refs.filter((r, i) => refs.indexOf(r) !== i);
  if (repeated.length) {
    fail("E_TAXONOMY_REF_DUPLICATE", "element_id repeated: " + repeated.join(", "),
      { repeated: repeated });
  }
  return refs;
}

/* ============================================================================
   LEG-E5b - WHOLE-BUILDING DEPRECIATION
   ============================================================================
   ONE SOURCE, ONE BLOCK. Unlike E5 this needs only the VOA whole-building
   obsolescence allowance. There is no plant-life table because a building does
   not have a plant life.

   WHAT IT DOES. Takes the building's age in years, reads a surviving
   proportion off a single age-banded scale, and applies that ONE factor to
   every element in the schedule.

   WHY THIS IS NOT SIMPLY WORSE THAN E5. E5's header sets out the case against
   it and the case is a good one: plant lives differ by an order of magnitude,
   and depreciating a lift, a boiler, a nurse-call system and the drainage
   under the slab at one rate moves value between pools that attract 14%, 6%
   and 3%. All true. But three things weigh the other way, and none of them is
   ours to settle:

     1. The per-element method applies a whole-BUILDING obsolescence scale per
        plant ELEMENT over a CIBSE life. That hybrid is not stock VOA
        methodology (ATP-F-3, item 12927234437). It may be perfectly defensible; it
        has not been ruled on by anybody.
     2. Whole-building depreciation IS the stock contractor's-basis treatment,
        so it is the one an HMRC valuer is likeliest to recognise on sight.
     3. E5 needs a 95-row crosswalk between the fixture taxonomy and CIBSE's own
        component vocabulary that does not exist. E5b needs no crosswalk at all.

   SO THIS MODULE DOES NOT CHOOSE. Both methods are built, both are gated off,
   and the default is neither - which is today's behaviour exactly. Same
   discipline as the CTA switches in Phase 51: build both, ship neither, and
   put the choice in front of the person qualified to make it.

   THE SAME FLOOR GUARD APPLIES. A building past the end of its scale does not
   depreciate to zero, an age beyond the last band is clamped rather than
   extrapolated, and the residual floor is read from the scale, never assumed.
   ============================================================================ */

function wholeBuildingDepreciationFactor(input, opts) {
  opts = opts || {};
  if (!gateOn("leg_e5b_whole_building_depreciation", opts)) {
    return {
      factor: 1, applied: false,
      authority: "replacement cost new, undepreciated - LEG-E5b not applied",
      flags: ["LEG_E5B_NO_DEPRECIATION"]
    };
  }
  const age = input && input.building_age_years;
  if (typeof age !== "number" || !isFinite(age) || age < 0) {
    fail("E_BUILDING_AGE_REQUIRED",
      "whole-building depreciation needs a non-negative building_age_years. " +
      "Refusing a default age - an unknown age is a question, not a zero.",
      { given: age });
  }

  const scales = requireTable(opts, "CB_VOA_BUILDING_OBSOLESCENCE",
    "leg_e5b_whole_building_depreciation");
  const scaleKey = input.building_obsolescence_scale || scales.default_scale || "default";
  const scale = scales.scales[scaleKey];
  if (scale === undefined) {
    fail("E_BUILDING_OBSOLESCENCE_SCALE_NOT_IN_TABLE",
      "no VOA whole-building obsolescence scale '" + scaleKey + "'",
      { scale: scaleKey });
  }

  if (!Array.isArray(scale.bands) || !scale.bands.length) {
    fail("E_BUILDING_OBSOLESCENCE_SCALE_EMPTY",
      "VOA whole-building obsolescence scale '" + scaleKey + "' has no bands",
      { scale: scaleKey });
  }

  /* Clamp to the LAST BAND, never extrapolate past it. Where the scale's final
     band is closed (say it ends at 80 years), a 100-year-old building takes
     that band's value rather than a value read off a curve nobody published. */
  const lastBand = scale.bands[scale.bands.length - 1];
  const cap = (lastBand[1] === null || lastBand[1] === undefined) ? null : lastBand[1];
  const beyond = cap !== null && age >= cap;
  const ageUsed = beyond ? cap : age;
  const surviving = beyond ? lastBand[2] : bandLookup(scale.bands, age, "building_age_years");

  const floor = (scale.residual_floor === undefined || scale.residual_floor === null)
    ? 0 : scale.residual_floor;
  const factor = Math.max(surviving, floor);

  const flags = ["LEG_E5B_APPLIED"];
  if (beyond) flags.push("BUILDING_AGE_BEYOND_SCALE");
  if (surviving < floor) flags.push("RESIDUAL_FLOOR_APPLIED");

  return {
    factor: factor,
    applied: true,
    building_age_years: age,
    age_used: ageUsed,
    residual_floor: floor,
    scale: scaleKey,
    authority: "VOA whole-building obsolescence scale '" + scaleKey + "' on a building " +
               "age of " + age + "y (" + scales.source + ")",
    flags: flags
  };
}

/* ============================================================================
   THE DEPRECIATION METHOD SWITCH - board item 12927234437
   ============================================================================
   THREE STATES, AND THE DEFAULT IS THE ONE WE HAVE TODAY.

     none            factor 1 on every element. TODAY'S BEHAVIOUR, unchanged.
     per_element     LEG-E5.  CIBSE life per element x VOA obsolescence.
     whole_building  LEG-E5b. One VOA age allowance for the whole property.

   WHY none IS THE DEFAULT AND NOT per_element. Both methods are gated off with
   empty tables, so today every method produces a factor of 1 and the default
   changes no number whatever it is set to. But a default is not neutral: it is
   what runs when nobody decides, and on the day a table lands the default is
   what silently starts applying. Defaulting to a METHOD would be choosing
   between them by inaction, and choosing between them is precisely the thing
   this item exists to hand to a surveyor.

   WHAT HAPPENS IF SOMEONE ASKS FOR BOTH. Refused. They are alternatives, not
   layers - applying an element's own age allowance and then the building's on
   top of it depreciates the same asset twice. There is no configuration in
   which stacking them is right, so it is an error rather than a flag.

   ATTRIBUTION. depreciation_method_source reads 'default' until something sets
   it, 'config' when a caller sets it, and 'surveyor' when a named surveyor
   does. Whose judgement a figure rests on is part of the figure - the same
   convention resolveValuationBasis() already uses for the valuation basis.
   ============================================================================ */

const DEPRECIATION_METHOD = {
  NONE: "none",
  PER_ELEMENT: "per_element",
  WHOLE_BUILDING: "whole_building"
};
const DEPRECIATION_METHOD_DEFAULT = DEPRECIATION_METHOD.NONE;

/* THE COMPANY WORKING METHOD - surveyor pack I5, answered 1 September 2026.

   Lakhbir Dhillon, asked how ageing should be applied, answered "one reduction
   across the whole building". That is recorded here so it is a written
   position rather than a remembered conversation.

   WHAT THIS IS NOT, AND THE DISTINCTION IS THE WHOLE POINT.

   It is NOT the default. DEPRECIATION_METHOD_DEFAULT stays NONE and the
   resolution rules above are untouched. Making a client's stated preference
   the default would turn inaction into a decision, which is the one thing the
   comment above says must not happen.

   It is NOT set by a surveyor. Lakhbir is the Head of Business Development, not the chartered
   surveyor whose signature the schema requires on anything graded D. Anything
   resolved from this constant still raises
   DEPRECIATION_METHOD_NOT_SET_BY_SURVEYOR, and that flag is correct.

   It is NOT effective. leg_e5b_whole_building_depreciation is OFF and stays
   off - it is blocked on the VOA obsolescence licence, which is a purchase
   and not an opinion. Resolving with this method today returns
   effective:false and WHOLE_BUILDING_METHOD_SELECTED_BUT_GATE_OFF.

   SO WHAT DOES IT DO. It records which of the two built methods the business
   intends to use when the licence lands, so that the choice is already made
   and visibly attributed rather than being made silently by whoever wires the
   caller up. It changes no number today and it is designed not to.

   ONE THING TO CARRY TO THE SURVEYOR, AND NOT AS A SEPARATE POINT. I5 accepts
   LESS precision in ageing - one factor for the whole building. I4, answered
   in the same sitting, asks for MORE precision in counting - room by room
   rather than by floor area, deliberately over-engineered. That pairing may be
   right (counting is cheap once a room list exists; per-element ageing needs
   CIBSE lives we do not hold and would be false precision on estimated
   quantities) but it is a PAIR, and putting either half to the surveyor
   without the other invites an answer to the wrong question. */
const CB_P9_WORKING_METHOD = {
  depreciation_method: DEPRECIATION_METHOD.WHOLE_BUILDING,
  stated_by: "Lakhbir Dhillon (Head of Business Development)",
  stated_on: "2026-09-01",
  source: "surveyor pack question I5",
  set_by_surveyor: false,
  is_the_default: false,
  effective_today: false,
  blocked_on: "leg_e5b_whole_building_depreciation - VOA obsolescence licence",
  paired_with: "I4 room-driven counting - put both to the surveyor together, not separately"
};

function resolveDepreciationMethod(input, opts) {
  input = input || {};
  const chosen = input.depreciation_method;
  if (chosen !== undefined && chosen !== null) {
    const known = chosen === DEPRECIATION_METHOD.NONE ||
                  chosen === DEPRECIATION_METHOD.PER_ELEMENT ||
                  chosen === DEPRECIATION_METHOD.WHOLE_BUILDING;
    if (!known) {
      fail("E_UNKNOWN_DEPRECIATION_METHOD",
        "depreciation_method must be '" + DEPRECIATION_METHOD.NONE + "', '" +
        DEPRECIATION_METHOD.PER_ELEMENT + "' or '" + DEPRECIATION_METHOD.WHOLE_BUILDING + "'",
        { given: chosen });
    }
  }
  const bySurveyor = !!(input.depreciation_method_set_by);

  const perElementOn = gateOn("leg_e5_per_element_depreciation", opts);
  const wholeBuildingOn = gateOn("leg_e5b_whole_building_depreciation", opts);

  /* THE ONE BACK-COMPATIBILITY RULE, AND WHY IT IS NOT A CHOICE.

     Before Phase 52 there was exactly one method, and turning the E5 gate on
     applied it. "Default to current behaviour" means that configuration must
     keep behaving identically: E5 gate on, E5b gate off, no method stated ->
     per_element, exactly as before. Nothing about a number changes.

     It does NOT run the other way. E5b's gate on with no method stated resolves
     to none, because E5b is new: nothing was behaving that way before, so
     falling into it would not be preserving behaviour, it would be choosing.
     Both gates on with no method stated also resolves to none - that is the
     configuration in which a genuine choice exists, and it is the one place
     where inaction must not become a decision. */
  let method;
  let backCompat = false;
  if (chosen !== undefined && chosen !== null) {
    method = chosen;
  } else if (perElementOn && !wholeBuildingOn) {
    method = DEPRECIATION_METHOD.PER_ELEMENT;
    backCompat = true;
  } else {
    method = DEPRECIATION_METHOD_DEFAULT;
  }

  /* Two methods that both claim the same asset's age. Not a flag - an error. */
  if (method === DEPRECIATION_METHOD.PER_ELEMENT && wholeBuildingOn && perElementOn &&
      input.also_apply_whole_building === true) {
    fail("E_DEPRECIATION_METHODS_STACKED",
      "per-element and whole-building depreciation are alternatives, not layers. " +
      "Applying both depreciates the same asset twice.", {});
  }

  const flags = [];
  if (method === DEPRECIATION_METHOD.NONE) {
    flags.push("DEPRECIATION_METHOD_NONE");
    /* A live table with no method selected is the state most likely to be an
       oversight rather than a decision, so it is named rather than left quiet. */
    if (perElementOn || wholeBuildingOn) flags.push("DEPRECIATION_AVAILABLE_BUT_METHOD_NOT_CHOSEN");
  }
  if (method === DEPRECIATION_METHOD.PER_ELEMENT && !perElementOn) {
    flags.push("PER_ELEMENT_METHOD_SELECTED_BUT_GATE_OFF");
  }
  if (method === DEPRECIATION_METHOD.WHOLE_BUILDING && !wholeBuildingOn) {
    flags.push("WHOLE_BUILDING_METHOD_SELECTED_BUT_GATE_OFF");
  }
  if (backCompat) flags.push("DEPRECIATION_METHOD_INHERITED_FROM_E5_GATE");
  if (!bySurveyor) flags.push("DEPRECIATION_METHOD_NOT_SET_BY_SURVEYOR");

  return {
    method: method,
    method_source: bySurveyor ? "surveyor" : (chosen ? "config" : (backCompat ? "e5_gate" : "default")),
    method_set_by: input.depreciation_method_set_by || null,
    per_element_available: perElementOn,
    whole_building_available: wholeBuildingOn,
    effective: (method === DEPRECIATION_METHOD.PER_ELEMENT && perElementOn) ||
               (method === DEPRECIATION_METHOD.WHOLE_BUILDING && wholeBuildingOn),
    confidence_grade: "D",   /* surveyor judgement - consolidated schema 0.5 */
    flags: flags
  };
}

/* ============================================================================
   VALUATION BASIS SWITCH - board item 12804374838
   ============================================================================
   NOT BLOCKED, AND DONE. The item's own text says so: "NOT BLOCKING - build
   both branches behind a config flag, surveyor picks." It had been tagged to
   the surveyor and sat untouched; it is a switch, and a switch does not need a
   surveyor to exist - it needs a surveyor to be SET.

   THE TWO BASES
     replacement_new  what it would cost to install the plant brand new today.
                      Simpler, and produces a HIGHER figure.
     drc              depreciated replacement cost - the same, then reduced for
                      the age and condition of what is actually there. More
                      defensible, and produces a LOWER figure.

   THE DEFAULT IS drc, THE CONSERVATIVE BASIS. Three reasons, in order of
   weight.

   1. The asymmetry of being wrong. If we default high and the surveyor lowers
      it, a client has already been shown a number we then take away - and on
      the residual path that number has usually reached them through the public
      calculator. If we default low and the surveyor raises it, the client gets
      better news than promised. Only one of those two costs us a client, and
      only one of them looks like a bait.
   2. It is the harder basis to attack. DRC values what is actually in the
      building. Replacement-new values a building nobody has - a twelve-year-old
      boiler valued as new is a figure that invites an enquiry to start by
      asking what else we rounded up.
   3. A default is not neutral, so it should not pretend to be. Whichever way
      this switch points, most cases will run on it, because defaults are what
      get accepted. A default that overstates is a commercial choice dressed as
      a technical one.

   AND WHY DEFAULTING TO drc CHANGES NO NUMBER TODAY. Depreciation is LEG-E5,
   which is gated off with empty tables. With E5 off, DRC applies a factor of
   1.0 to every element - arithmetically identical to replacement_new. So the
   conservative default is live from today and costs nothing, and the day E5's
   tables land the basis is already pointing the right way. The output says
   plainly that the basis is DRC but that no depreciation was applied, with the
   flag DRC_SELECTED_BUT_DEPRECIATION_UNAVAILABLE. A DRC label over
   undepreciated arithmetic would otherwise be a quiet lie on the face of a
   report.

   THE SURVEYOR OVERRIDES IT, and their choice is recorded with attribution -
   basis_source is 'default' until a named surveyor sets it. Whose judgement a
   figure rests on is part of the figure.
   ============================================================================ */

const VALUATION_BASIS = { REPLACEMENT_NEW: "replacement_new", DRC: "drc" };
const VALUATION_BASIS_DEFAULT = VALUATION_BASIS.DRC;

function resolveValuationBasis(input, opts) {
  input = input || {};
  const chosen = input.valuation_basis;
  if (chosen !== undefined && chosen !== null) {
    if (chosen !== VALUATION_BASIS.REPLACEMENT_NEW && chosen !== VALUATION_BASIS.DRC) {
      fail("E_UNKNOWN_VALUATION_BASIS",
        "valuation_basis must be '" + VALUATION_BASIS.REPLACEMENT_NEW + "' or '" +
        VALUATION_BASIS.DRC + "'", { given: chosen });
    }
  }
  const basis = (chosen === undefined || chosen === null) ? VALUATION_BASIS_DEFAULT : chosen;
  const bySurveyor = !!(input.basis_set_by);

  /* Available means "some depreciation method could run", not "E5 specifically".
     Widened in Phase 52 when LEG-E5b landed: a DRC label over undepreciated
     arithmetic is a quiet lie whichever method was going to supply the factor,
     so the DRC_SELECTED_BUT_DEPRECIATION_UNAVAILABLE flag has to consider both. */
  const depreciationAvailable = gateOn("leg_e5_per_element_depreciation", opts) ||
                                gateOn("leg_e5b_whole_building_depreciation", opts);
  const flags = [];
  if (basis === VALUATION_BASIS.DRC && !depreciationAvailable) {
    flags.push("DRC_SELECTED_BUT_DEPRECIATION_UNAVAILABLE");
  }
  if (basis === VALUATION_BASIS.REPLACEMENT_NEW) {
    flags.push("REPLACEMENT_NEW_BASIS_HIGHER_FIGURE");
  }
  if (!bySurveyor) flags.push("VALUATION_BASIS_NOT_SET_BY_SURVEYOR");

  return {
    basis: basis,
    basis_source: bySurveyor ? "surveyor" : (chosen ? "config" : "default"),
    basis_set_by: input.basis_set_by || null,
    depreciation_available: depreciationAvailable,
    depreciation_effective: basis === VALUATION_BASIS.DRC && depreciationAvailable,
    confidence_grade: "D",   /* surveyor judgement - consolidated schema 0.5 */
    flags: flags
  };
}

/* ============================================================================
   THE RESIDUAL APPORTIONMENT MODEL
   ============================================================================
   Specification section 4.1:

       m = PC / (A + B + C)
       qualifying_pm    = m x A
       nonqual_building = m x B
       apportioned_land = m x C

   The three outputs sum back to PC. That tie-back IS the s.562 "just and
   reasonable" apportionment, and it is asserted below on every run rather than
   trusted - if the three parts do not reconstitute the price paid, the
   apportionment is not an apportionment.

   THE ORDER OF OPERATIONS, which is where the four fixes actually land:

     base rate
       x location x contract size        LEG-E4   (gate)
       x depreciation                    LEG-E5   (gate, per element, DRC only)
       x (1 + prelims)                   LEG-E2   (gate removes it, residual only)
       x (1 + fees)                      LEG-E3   (gate makes it banded)
       x index to valuation date
   ============================================================================ */

function residualApportionment(input, opts) {
  opts = opts || {};
  input = input || {};

  const PC = input.purchase_consideration;
  if (typeof PC !== "number" || !isFinite(PC) || PC <= 0) {
    fail("E_PC_REQUIRED", "purchase_consideration must be a positive number", { given: PC });
  }
  const costBasis = input.cost_basis || COST_BASIS.RESIDUAL;
  const basisInfo = resolveValuationBasis(input, opts);
  const flags = [].concat(basisInfo.flags);

  const depMethod = resolveDepreciationMethod(input, opts);
  flags.push.apply(flags, depMethod.flags);

  /* Whole-building depreciation is one factor for the whole property, so it is
     resolved ONCE here rather than per element. Computing it inside the loop
     would produce the same number every time and would suggest, wrongly, that
     it varies by element. */
  const wholeBuildingDep = (basisInfo.basis === VALUATION_BASIS.DRC &&
                            depMethod.method === DEPRECIATION_METHOD.WHOLE_BUILDING)
    ? wholeBuildingDepreciationFactor(input, opts)
    : null;
  if (wholeBuildingDep) {
    (wholeBuildingDep.flags || []).forEach(f => { if (flags.indexOf(f) < 0) flags.push(f); });
  }

  const loc = locationAndContractSizeFactor(input, opts);
  flags.push.apply(flags, loc.flags);

  /* price_source is read only by leg_e2_oncosts_by_price_source (Phase 132);
     with that gate off it is carried and ignored. */
  const prelims = prelimsFactor(
    { cost_basis: costBasis, prelims_rate: input.prelims_rate,
      price_source: input.price_source }, opts);
  flags.push.apply(flags, prelims.flags);

  const index = (input.index_factor === undefined || input.index_factor === null)
    ? 1 : input.index_factor;
  if (typeof index !== "number" || !isFinite(index) || index <= 0) {
    fail("E_INDEX_INVALID", "index_factor must be a positive number", { given: index });
  }

  const elements = Array.isArray(input.elements) ? input.elements : [];
  if (!elements.length) {
    fail("E_NO_ELEMENTS", "the residual model needs at least one costed element", {});
  }

  /* Un-located, un-feed construction cost first - the VOA fee scale is banded
     on construction cost, so the fee rate cannot be known until the cost is.
     This is why fees are computed after the element loop and applied to the
     totals rather than inside it. The LEG-E4 location and contract-size factor
     is applied to the totals for a second and stronger reason: its own source
     forbids applying it per element. */
  let rawA = 0, rawB = 0;
  const lines = [];

  for (const el of elements) {
    if (!el || !el.element_ref) fail("E_ELEMENT_REF_REQUIRED", "every element needs an element_ref", {});
    const qty = el.qty, rate = el.rate;
    if (typeof qty !== "number" || !isFinite(qty) || qty < 0) {
      fail("E_ELEMENT_QTY_INVALID", "element " + el.element_ref + " qty must be non-negative",
        { element_ref: el.element_ref, given: qty });
    }
    if (typeof rate !== "number" || !isFinite(rate) || rate < 0) {
      fail("E_ELEMENT_RATE_INVALID", "element " + el.element_ref + " rate must be non-negative",
        { element_ref: el.element_ref, given: rate });
    }
    const pool = el.pool;
    if (pool !== "main" && pool !== "special" && pool !== "nonqual") {
      fail("E_ELEMENT_POOL_INVALID",
        "element " + el.element_ref + " pool must be 'main', 'special' or 'nonqual'",
        { element_ref: el.element_ref, given: pool });
    }

    /* Depreciation runs only on the DRC basis, and then only by the method
       actually selected. The three arms are exclusive by construction: there is
       no path on which an element takes both its own age allowance and the
       building's. */
    let dep;
    if (basisInfo.basis !== VALUATION_BASIS.DRC) {
      dep = { factor: 1, applied: false, flags: ["REPLACEMENT_NEW_NO_DEPRECIATION"] };
    } else if (depMethod.method === DEPRECIATION_METHOD.PER_ELEMENT) {
      dep = elementDepreciationFactor(el, opts);
    } else if (depMethod.method === DEPRECIATION_METHOD.WHOLE_BUILDING) {
      dep = wholeBuildingDep;
    } else {
      dep = { factor: 1, applied: false, flags: ["NO_DEPRECIATION_METHOD_SELECTED"] };
    }
    (dep.flags || []).forEach(f => { if (flags.indexOf(f) < 0) flags.push(f); });

    /* NO LOCATION FACTOR HERE, AND THAT IS THE POINT. Spon's says its location
       and contract-size adjustments must be applied to the total cost plan
       value and not to individual element or material items. An element line is
       therefore quantity x rate, depreciated, on-costed and indexed - and
       nothing else. The single LEG-E4 factor is applied to the summed total
       below. (Phase 97, 7 Sep 2026; this multiplication used to read
       "qty * rate * loc.factor * dep.factor * ...".) */
    const cost = qty * rate * dep.factor * prelims.factor * index;
    if (pool === "nonqual") rawB += cost; else rawA += cost;

    lines.push({
      element_ref: el.element_ref, pool: pool, qty: qty, rate: rate,
      depreciation_factor: dep.factor,
      prelims_factor: prelims.factor, index_factor: index,
      /* Named so nothing downstream can read a line as location-adjusted.
         location_adjusted is false on every line by construction; the flag
         exists so a report generator asserts it rather than assuming it. */
      location_adjusted: false,
      cost_before_location_and_fees: cost
    });
  }

  /* ------------------------------------------------- LEG-E4, applied ONCE --
     The location x contract-size factor lands here, on the summed cost plan,
     and nowhere else. It goes on BEFORE the fee scale is looked up, because
     the VOA fee scale is banded on construction cost and the adjusted total is
     the construction cost - looking the band up on an unadjusted total would
     read the wrong band on any job near an edge. */
  const locatedA = rawA * loc.factor;
  const locatedB = rawB * loc.factor;

  const fees = feesFactor({
    cost_basis: costBasis,
    fees_rate: input.fees_rate,
    construction_cost: locatedA + locatedB,
    /* F-1 (Phase 129): read only once both fee gates are on; never defaulted. */
    building_type: input.building_type
  }, opts);
  flags.push.apply(flags, fees.flags);

  const A = locatedA * fees.factor;
  const B = locatedB * fees.factor;
  lines.forEach(l => {
    l.fees_factor = fees.factor;
    l.cost = l.cost_before_location_and_fees * fees.factor;
  });

  /* APPLIED ONCE, CHECKED RATHER THAN ASSERTED IN A COMMENT. Two invariants,
     and the first is the one that matters.

     (1) EVERY LINE IS EXPLICABLE BY THE FACTORS IT DECLARES. A line states its
         qty, rate, depreciation, prelims and index - and location is not among
         them. So its cost must be exactly the product of those five. If a later
         change slips loc.factor back into the costing loop, the line stops
         reconciling against its own declared factors and this throws. That is
         the guard that would have caught the original defect; a check on the
         TOTAL never could, because one uniform factor distributes out of a sum
         and the total came out identical either way.

     (2) THE TOTALS ARE THE LINE SUM TIMES ONE LOCATION FACTOR AND ONE FEE
         FACTOR. This catches the opposite slip - the factor applied twice to
         the total, or applied to one pool and not the other. */
  let lineSum = 0;
  for (const l of lines) {
    const declared = l.qty * l.rate * l.depreciation_factor * l.prelims_factor *
                     l.index_factor;
    if (Math.abs(l.cost_before_location_and_fees - declared) >
        Math.max(1e-6, Math.abs(declared) * 1e-9)) {
      fail("E_LOCATION_FACTOR_NOT_APPLIED_ONCE",
        "element line '" + l.element_ref + "' costed to " +
        l.cost_before_location_and_fees + " but the factors it declares " +
        "multiply out to " + declared + ". The usual cause is the LEG-E4 " +
        "location or contract-size factor being applied inside the costing " +
        "loop. Spon's requires it on the total cost plan value, not on " +
        "individual element or material items.",
        { element_ref: l.element_ref, costed: l.cost_before_location_and_fees,
          declared: declared });
    }
    lineSum += l.cost_before_location_and_fees;
  }
  const expected = lineSum * loc.factor * fees.factor;
  if (Math.abs((A + B) - expected) > Math.max(1e-6, Math.abs(expected) * 1e-9)) {
    fail("E_LOCATION_FACTOR_NOT_APPLIED_ONCE",
      "the LEG-E4 location and contract-size factor must be applied exactly " +
      "once, to the total cost plan value. A + B came to " + (A + B) +
      " against " + expected + " from the unadjusted line sum.",
      { A_plus_B: A + B, expected: expected, location_factor: loc.factor });
  }

  /* C - bare-site land value. A range pre-survey (spec 4.2), so the whole
     result is a range and is reported as one. */
  let Clow, Chigh, landEstimated;
  if (typeof input.land_value_estimate === "number" && isFinite(input.land_value_estimate)) {
    if (input.land_value_estimate < 0) {
      fail("E_LAND_VALUE_INVALID", "land_value_estimate must be non-negative",
        { given: input.land_value_estimate });
    }
    Clow = Chigh = input.land_value_estimate;
    landEstimated = false;
  } else {
    const lf = input.land_fraction_low, hf = input.land_fraction_high;
    if (typeof lf !== "number" || typeof hf !== "number" || !(lf >= 0) || !(hf <= 1) || !(lf <= hf)) {
      fail("E_LAND_FRACTION_REQUIRED",
        "with no land_value_estimate, land_fraction_low and land_fraction_high " +
        "are required and must satisfy 0 <= low <= high <= 1",
        { low: lf, high: hf });
    }
    Clow = lf * PC; Chigh = hf * PC;
    landEstimated = true;
    flags.push("LAND_VALUE_ESTIMATED");
  }

  /* A higher land value LOWERS the qualifying figure, so the qualifying low
     pairs with the land high. Getting this inversion the wrong way round
     silently widens every claim - it is asserted in the tests. */
  function apportion(C) {
    const total = A + B + C;
    if (!(total > 0)) fail("E_ZERO_REPLACEMENT_COST", "A + B + C must be positive", {});
    const m = PC / total;
    return {
      m: m,
      qualifying_pm: m * A,
      nonqual_building: m * B,
      apportioned_land: m * C
    };
  }
  const atHighLand = apportion(Chigh);   /* -> qualifying LOW */
  const atLowLand  = apportion(Clow);    /* -> qualifying HIGH */

  /* the s.562 tie-back, checked not assumed */
  for (const r of [atHighLand, atLowLand]) {
    const sum = r.qualifying_pm + r.nonqual_building + r.apportioned_land;
    if (Math.abs(sum - PC) > Math.max(1e-6, PC * 1e-9)) {
      fail("E_APPORTIONMENT_DOES_NOT_TIE_BACK",
        "the three apportioned parts must sum to the purchase consideration " +
        "(s.562). They summed to " + sum + " against PC " + PC + ".",
        { sum: sum, PC: PC });
    }
  }

  /* split qualifying between the pools in proportion to their costed share */
  const mainRaw = lines.filter(l => l.pool === "main").reduce((s, l) => s + l.cost, 0);
  const specRaw = lines.filter(l => l.pool === "special").reduce((s, l) => s + l.cost, 0);
  const qualRaw = mainRaw + specRaw;
  const split = q => qualRaw > 0
    ? { main: q * (mainRaw / qualRaw), special: q * (specRaw / qualRaw) }
    : { main: 0, special: 0 };

  return {
    prepared_not_shipped: true,
    purchase_consideration: PC,
    valuation_basis: basisInfo,
    depreciation: depMethod,
    cost_basis: costBasis,
    components: { A: A, B: B, C_low: Clow, C_high: Chigh },
    /* The LEG-E4 step, shown as the single step it is. line_sum_unadjusted is
       the summed element lines with NO location factor in them; multiply by
       location_factor once and by fees_factor once and you have A + B. */
    cost_plan: {
      line_sum_unadjusted: lineSum,
      location_factor_applied_once: loc.factor,
      total_after_location: locatedA + locatedB,
      fees_factor: fees.factor,
      applied_per_element: false
    },
    factors: {
      location: loc, prelims: prelims, fees: fees, index_factor: index,
      whole_building_depreciation: wholeBuildingDep
    },
    qualifying_pm: { low: atHighLand.qualifying_pm, high: atLowLand.qualifying_pm },
    qualifying_pools: {
      low: split(atHighLand.qualifying_pm),
      high: split(atLowLand.qualifying_pm)
    },
    /* Named by MAGNITUDE, not by which land scenario produced them. A high
       land value pulls the multiplier down, so it lowers the building figure
       as well as the plant figure - the building low therefore comes from the
       high-land run, exactly as the qualifying low does. Land moves the other
       way. Getting these labels wrong is invisible in the arithmetic and
       obvious in a report, which is why G1 asserts the tie-back on the two
       COHERENT scenarios rather than on the min/max of each field. */
    nonqual_building: { low: atHighLand.nonqual_building, high: atLowLand.nonqual_building },
    apportioned_land: { low: atLowLand.apportioned_land, high: atHighLand.apportioned_land },
    multiplier: { at_low_land: atLowLand.m, at_high_land: atHighLand.m },
    land_value_estimated: landEstimated,
    lines: lines,
    /* Consolidated schema 0.5 grade inheritance: a derived figure takes the
       WORST grade among its inputs, never A. gross_internal_area_m2 and
       construction_type are both D, and the valuation basis is D. So this is
       D, and a D left unresolved blocks the sign-off-ready output. */
    confidence_grade: "D",
    flags: flags.filter((f, i) => flags.indexOf(f) === i)
  };
}

/* --------------------------------------------------------------- exports -- */

module.exports = {
  CostModelError,
  CB_P9_GATES,
  CB_P9_TABLES,
  CB_VOA_FEE_SCALE,
  CB_VOA_FEE_BUILDING_TYPE_ADDERS,
  BUILDING_TYPE,
  CB_LOCATION_FACTORS,
  CB_PRICE_SOURCES,
  PRICE_SOURCE_ENTRY_SHAPE,
  INDEX_BASIS,
  CB_CONTRACT_SIZE_ADJUSTMENT,
  CB_VOA_OBSOLESCENCE,
  CB_CIBSE_PLANT_LIVES,
  CB_VOA_BUILDING_OBSOLESCENCE,
  COST_BASIS,
  VALUATION_BASIS,
  VALUATION_BASIS_DEFAULT,
  DEPRECIATION_METHOD,
  DEPRECIATION_METHOD_DEFAULT,
  CB_P9_WORKING_METHOD,
  SPEC_PRELIMS_DEFAULT,
  SPEC_FEES_DEFAULT,
  gateOn,
  prelimsFactor,
  feesFactor,
  locationAndContractSizeFactor,
  elementDepreciationFactor,
  assertCrosswalkComplete,
  taxonomyElementRefs,
  wholeBuildingDepreciationFactor,
  resolveDepreciationMethod,
  resolveValuationBasis,
  residualApportionment,
  bandLookup,
  interpolateScale,
  percentageAdjustmentToFactor
};
