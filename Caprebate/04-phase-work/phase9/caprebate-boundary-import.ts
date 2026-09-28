/**
 * Caprebate — Land Boundary Import Connector
 * Board item 12830205914: "Pull in land boundary maps to get site size
 * (waiting on the licence)". Phase 9, item 1.
 *
 * STATUS: PREPARED, NOT SHIPPED. No live data has ever been pulled through
 * this module. See caprebate-boundary-import.md for the full specification,
 * the three-outcome licensing design, and every format assumption flagged for
 * verification once the licence lands.
 *
 * WHAT THIS IS. A connector that takes title/parcel boundary geometry (and,
 * separately, a building-footprint geometry) and derives two numbers for the
 * property profile:
 *   - site_area_m2            (new field, area_m2, schema §1.C conventions)
 *   - building_coverage_ratio (new field, decimal 0-1, footprint / site)
 *
 * THE DESIGN CONSTRAINT THAT MATTERS MOST. Licensing has three possible
 * outcomes and the middle one is the likely one:
 *   (a) NOT_CLEARED               — never cleared at all
 *   (b) INTERNAL_CALCULATION_ONLY — compute the numbers, never reproduce the
 *                                   map/geometry in an outgoing report
 *   (c) FULL_REPRODUCTION         — geometry may appear in reports too
 * PHASE 132e (16 September 2026): (b) is now DECIDED, not assumed — by
 * Lakhbir Dhillon, Head of Business Development, answer read 15 September 2026. Fetching is still
 * OFF (§7, §10). Both attribution statements are in the sources note (§12).
 * This module is built so that moving between (a)/(b)/(c) is a change to
 * CURRENT_LICENCE_PERMISSION alone (§7) — no other line changes. The split is
 * structural, not conventional: derived numbers travel as `DerivedScalar<T>`
 * (safe, freely embeddable in any report); geometry travels as an opaque
 * `CartographicArtefact` handle whose actual coordinates live in a
 * module-private WeakMap and can be read out only via
 * `releaseGeometryForReport`, which is the single choke point that checks
 * `allow_report_reproduction` and is capable of refusing (§6, §9).
 *
 * Schema authority: Build-Prep-Consolidated-Schema.md §0.2 (type system),
 * §0.3 (UNKNOWN rule — not engaged here, no GATE fields), §0.4 (provenance
 * codes), §0.5 (confidence grades + grade inheritance), §1.C (property
 * profile — see the note on `gross_internal_area_m2` grade D and this
 * module's reasoning for why a boundary-derived site area is graded
 * differently, in the .md spec).
 *
 * Grade/ProvCode/worstGrade below intentionally MIRROR
 * phase3/caprebate-source-register.ts rather than importing it, so this
 * remains a self-contained, independently reviewable three-file deliverable
 * (see spec, "known duplication").
 *
 * Runs on Node >= 22.6 with type stripping (`node file.ts`). No enums, no
 * namespaces, no parameter properties — those are not strippable.
 *
 * Run the tests:
 *   node --test caprebate-boundary-import.test.ts
 */

/* ------------------------------------------------------------------ *
 * 1. Schema primitives (mirrors Build-Prep-Consolidated-Schema.md §0.4/0.5)
 * ------------------------------------------------------------------ */

/** Schema §0.4. `DR` is what every output of this module carries. */
export type ProvCode = 'CA' | 'CD' | 'API' | 'SV' | 'DR' | 'CTA';

/** Schema §0.5. A is best, E is worst (most human-dependent). */
export type Grade = 'A' | 'B' | 'C' | 'D' | 'E';

const GRADE_ORDER: Record<Grade, number> = { A: 0, B: 1, C: 2, D: 3, E: 4 };

/** Worst-of, per schema §0.5 grade inheritance: a DR field is never better than its worst input. */
export function worstGrade(grades: readonly Grade[]): Grade {
  if (grades.length === 0) {
    throw new BoundaryImportError('E_NO_INPUTS', 'worstGrade needs at least one grade');
  }
  return grades.reduce((a, b) => (GRADE_ORDER[b] > GRADE_ORDER[a] ? b : a));
}

/* ------------------------------------------------------------------ *
 * 2. Errors
 * ------------------------------------------------------------------ */

export type BoundaryImportErrorCode =
  | 'E_LICENCE_NOT_CLEARED'
  | 'E_LICENCE_NOT_CLEARED_FOR_REPRODUCTION'
  | 'E_UNKNOWN_CRS'
  | 'E_CRS_NOT_PROJECTED'
  | 'E_DEGENERATE_RING'
  | 'E_INVALID_COORDINATE'
  | 'E_HOLE_EXCEEDS_EXTERIOR'
  | 'E_EMPTY_GEOMETRY'
  | 'E_ZERO_SITE_AREA'
  | 'E_FOOTPRINT_EXCEEDS_SITE'
  | 'E_NEGATIVE_AREA'
  | 'E_GRADE_EXCEEDS_SOURCE'
  | 'E_UNKNOWN_SOURCE_KIND'
  | 'E_WRONG_ARTEFACT_KIND'
  | 'E_WRONG_SCALAR_FIELD'
  | 'E_NOT_AN_ARTEFACT'
  | 'E_NO_INPUTS'
  // Phase 133 (17 September 2026): translation from the published INSPIRE shape (§13).
  | 'E_MISSING_INSPIRE_ID'
  | 'E_MIXED_CRS'
  | 'E_CONFLICTING_DUPLICATE_POLYGON'
  // Phase 133 (17 September 2026): spatial join, point -> INSPIRE polygon (§14).
  | 'E_INVALID_POINT'
  | 'E_NO_FREEHOLD_POLYGON'
  | 'E_AMBIGUOUS_POLYGON'
  // Phase 150 (24 September 2026): the real fetcher, 09-app/backend/src/connectors/inspire.ts, built and switched off.
  | 'E_FETCHING_SWITCHED_OFF'
  | 'E_FETCH_REFUSED'
  | 'E_FETCH_FAILED'
  | 'E_FILE_UNREADABLE';

export class BoundaryImportError extends Error {
  code: BoundaryImportErrorCode;
  detail: Record<string, unknown>;
  constructor(code: BoundaryImportErrorCode, message: string, detail: Record<string, unknown> = {}) {
    super(`[${code}] ${message}`);
    this.name = 'BoundaryImportError';
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ *
 * 3. Coordinate reference systems — the "wrong CRS" trap
 * ------------------------------------------------------------------ */

/**
 * CRS is carried as a plain EPSG string, not a closed enum, because a real
 * feed may name a CRS this module has never seen. An unrecognised code is a
 * hard refusal (E_UNKNOWN_CRS), not a silent assumption of metres.
 */
export type CrsCode = string;

/** The only CRS this module will compute an area in: British National Grid, metres. */
const COMPUTABLE_METRE_CRS: ReadonlySet<CrsCode> = new Set(['EPSG:27700']);

/** Known geographic (degree-based) CRS codes — recognised specifically so the refusal is informative. */
const KNOWN_DEGREE_CRS: ReadonlySet<CrsCode> = new Set(['EPSG:4326', 'WGS84', 'CRS84', 'OGC:CRS84']);

/**
 * REFUSE rather than guess. A lat/long CRS is degrees; naive shoelace area in
 * degrees is not an area in any usable unit and must never be reported as
 * one. This is the trap named in the board item and it is handled here, in
 * exactly one place, so every caller of computeSiteArea / computeFootprintAreaM2
 * benefits without having to remember to check.
 */
function assertComputableCrs(crs: CrsCode): void {
  if (COMPUTABLE_METRE_CRS.has(crs)) return;
  if (KNOWN_DEGREE_CRS.has(crs)) {
    throw new BoundaryImportError(
      'E_CRS_NOT_PROJECTED',
      `CRS '${crs}' is a geographic (lat/long) system measured in degrees. Area cannot be computed from ` +
        `degree coordinates by the planar shoelace formula — the result would be a number with no metric ` +
        `meaning, silently wrong. This module deliberately does not reproject. Supply the boundary in a ` +
        `projected metric CRS (British National Grid, EPSG:27700) instead.`,
      { crs },
    );
  }
  throw new BoundaryImportError(
    'E_UNKNOWN_CRS',
    `CRS '${crs}' is not recognised by this connector. Refusing rather than assuming metres: an unlisted ` +
      `CRS could be degrees, a non-equal-area projection, or use non-metre units (feet). Add it to ` +
      `COMPUTABLE_METRE_CRS only after confirming it is a projected, equal-area, metre-unit system.`,
    { crs },
  );
}

/* ------------------------------------------------------------------ *
 * 4. Geometry types — polygon / multipolygon, holes supported
 * ------------------------------------------------------------------ */

export type RawRing = readonly (readonly [number, number])[];

export type RawPolygonPart = { exterior: RawRing; holes?: readonly RawRing[] };

/**
 * DOCUMENTED FORMAT ASSUMPTION (see spec §Format assumptions, item 1-3).
 * A polygon is `{ exterior, holes? }` explicitly, rather than a raw
 * GeoJSON-style `coordinates` array where ring 0 is exterior and the rest are
 * holes by position. Chosen for clarity in a hand-written fixture; a thin
 * translation shim will be needed at integration time if the licensed feed
 * turns out to be raw GeoJSON.
 */
export type RawBoundaryGeometry =
  | { readonly type: 'Polygon'; readonly crs: CrsCode; readonly exterior: RawRing; readonly holes?: readonly RawRing[] }
  | { readonly type: 'MultiPolygon'; readonly crs: CrsCode; readonly polygons: readonly RawPolygonPart[] };

type InternalPolygon = { exterior: RawRing; holes: readonly RawRing[] };
type InternalGeometry = { polygons: readonly InternalPolygon[] };

function normaliseGeometry(input: RawBoundaryGeometry): InternalGeometry {
  if (input.type === 'Polygon') {
    return { polygons: [{ exterior: input.exterior, holes: input.holes ?? [] }] };
  }
  return { polygons: input.polygons.map((p) => ({ exterior: p.exterior, holes: p.holes ?? [] })) };
}

/* ------------------------------------------------------------------ *
 * 5. Shoelace area — winding-order agnostic, holes subtracted
 * ------------------------------------------------------------------ */

/**
 * Unsigned area of one linear ring via the shoelace formula. Indexes modulo
 * ring length, so the ring may or may not repeat its first point at the end —
 * both representations are handled identically. Taking the absolute value of
 * the signed sum means the result does not depend on winding order (CW vs
 * CCW): "handle winding order" here means callers never have to know or
 * normalise it, not that a particular winding is enforced.
 */
function ringAreaM2(ring: RawRing): number {
  if (ring.length < 3) {
    throw new BoundaryImportError('E_DEGENERATE_RING', `a ring needs at least 3 points, got ${ring.length}`, {
      point_count: ring.length,
    });
  }
  let sum = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    if (![x1, y1, x2, y2].every(Number.isFinite)) {
      throw new BoundaryImportError('E_INVALID_COORDINATE', 'ring contains a non-finite coordinate', {
        point_a: ring[i],
        point_b: ring[(i + 1) % n],
      });
    }
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function polygonAreaM2(polygon: InternalPolygon): number {
  const exteriorArea = ringAreaM2(polygon.exterior);
  const holesArea = polygon.holes.reduce((acc, hole) => acc + ringAreaM2(hole), 0);
  if (holesArea > exteriorArea) {
    throw new BoundaryImportError(
      'E_HOLE_EXCEEDS_EXTERIOR',
      `hole area (${holesArea.toFixed(1)} m²) exceeds exterior ring area (${exteriorArea.toFixed(1)} m²) — ` +
        `the holes cannot be excluded courtyards of this exterior; check ring order and units`,
      { exteriorArea, holesArea },
    );
  }
  return exteriorArea - holesArea;
}

function geometryAreaM2(geom: InternalGeometry): number {
  if (geom.polygons.length === 0) {
    throw new BoundaryImportError('E_EMPTY_GEOMETRY', 'geometry has no polygons to measure');
  }
  return geom.polygons.reduce((acc, p) => acc + polygonAreaM2(p), 0);
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;

/* ------------------------------------------------------------------ *
 * 6. CartographicArtefact — the reproducible-map-material type
 *
 *    Its coordinates are held in a module-private WeakMap, not on the
 *    object itself. External code holds only the branded handle: it can
 *    pass the handle to computeSiteArea / computeFootprintAreaM2 (internal
 *    use — no permission needed) but cannot read a single coordinate off
 *    it without going through releaseGeometryForReport (§9), which is the
 *    only function in this module that can turn an artefact back into
 *    plain, exportable ring data, and the only one that checks
 *    `allow_report_reproduction`. There is no other path to the numbers.
 * ------------------------------------------------------------------ */

export type ArtefactKind = 'PARCEL_BOUNDARY' | 'BUILDING_FOOTPRINT';

/**
 * Where a boundary/footprint geometry could plausibly come from, and the best
 * confidence grade each is entitled to mint (mirrors the `max_grade` idiom in
 * phase3/caprebate-source-register.ts §3). See the spec for the reasoning
 * behind each ceiling — in particular why HMLR/OS register sources are capped
 * at B, never A, despite being an "API / register lookup" per schema §0.5.
 */
export type BoundarySourceKind =
  | 'HMLR_INSPIRE_INDEX_POLYGON'
  | 'HMLR_TITLE_PLAN_DIGITISED'
  | 'OS_MASTERMAP_BUILDING_FOOTPRINT'
  | 'CLIENT_SUPPLIED_SKETCH'
  | 'SURVEYOR_MEASURED';

const MAX_GRADE_FOR_SOURCE_KIND: Record<BoundarySourceKind, Grade> = {
  HMLR_INSPIRE_INDEX_POLYGON: 'B',
  HMLR_TITLE_PLAN_DIGITISED: 'B',
  OS_MASTERMAP_BUILDING_FOOTPRINT: 'B',
  CLIENT_SUPPLIED_SKETCH: 'C',
  SURVEYOR_MEASURED: 'D',
};

const DEFAULT_PROV_FOR_SOURCE_KIND: Record<BoundarySourceKind, ProvCode> = {
  HMLR_INSPIRE_INDEX_POLYGON: 'API',
  HMLR_TITLE_PLAN_DIGITISED: 'API',
  OS_MASTERMAP_BUILDING_FOOTPRINT: 'API',
  CLIENT_SUPPLIED_SKETCH: 'CA',
  SURVEYOR_MEASURED: 'SV',
};

export type BoundaryProvenance = {
  prov: ProvCode;
  source_kind: BoundarySourceKind | 'COMPUTED';
  grade: Grade;
  /** ISO-8601, or null for a purely derived (DR) value with no retrieval of its own. */
  retrieved_at: string | null;
  locator: string | null;
  /** Non-empty only when prov === 'DR'. */
  derived_from: readonly string[];
};

declare const ARTEFACT_BRAND: unique symbol;

/** An opaque handle. Its geometry is not a property of this object — see §6 banner. */
export type CartographicArtefact = {
  readonly [ARTEFACT_BRAND]: 'caprebate.boundary.artefact.v1';
  readonly artefact_id: string;
  readonly kind: ArtefactKind;
  readonly crs: CrsCode;
  readonly grade: Grade;
  readonly prov: BoundaryProvenance;
};

const GEOMETRY_STORE: WeakMap<CartographicArtefact, InternalGeometry> = new WeakMap();

function requireGeometry(artefact: CartographicArtefact): InternalGeometry {
  const geom = GEOMETRY_STORE.get(artefact);
  if (!geom) {
    throw new BoundaryImportError(
      'E_NOT_AN_ARTEFACT',
      'this handle was not produced by parseBoundaryGeometry in this module instance (or its geometry was never stored)',
    );
  }
  return geom;
}

function assertArtefactKind(artefact: CartographicArtefact, kind: ArtefactKind): void {
  if (artefact.kind !== kind) {
    throw new BoundaryImportError('E_WRONG_ARTEFACT_KIND', `expected a ${kind} artefact, got ${artefact.kind}`, {
      artefact_id: artefact.artefact_id,
    });
  }
}

export type ParseBoundaryInput = {
  artefact_id: string;
  kind: ArtefactKind;
  source_kind: BoundarySourceKind;
  /** Defaults to the source kind's ceiling. May be lower, never higher (E_GRADE_EXCEEDS_SOURCE). */
  grade?: Grade;
  retrieved_at: string;
  locator: string;
};

/**
 * Parse a polygon / multipolygon into an opaque CartographicArtefact. Gated
 * on `permission.allow_internal_calculation` (defaults to
 * CURRENT_LICENCE_PERMISSION, §7) — under outcome (a) NOT_CLEARED, the
 * geometry may not even be held by this module, let alone measured.
 */
export function parseBoundaryGeometry(
  raw: RawBoundaryGeometry,
  meta: ParseBoundaryInput,
  permission: LicencePermission = CURRENT_LICENCE_PERMISSION,
): CartographicArtefact {
  assertInternalCalculationAllowed(permission);

  const ceiling = MAX_GRADE_FOR_SOURCE_KIND[meta.source_kind];
  if (ceiling === undefined) {
    throw new BoundaryImportError('E_UNKNOWN_SOURCE_KIND', `no ceiling grade registered for '${meta.source_kind}'`, {
      source_kind: meta.source_kind,
    });
  }
  const grade = meta.grade ?? ceiling;
  if (GRADE_ORDER[grade] < GRADE_ORDER[ceiling]) {
    throw new BoundaryImportError(
      'E_GRADE_EXCEEDS_SOURCE',
      `grade ${grade} is better than the best grade source kind '${meta.source_kind}' can produce (${ceiling})`,
      { source_kind: meta.source_kind, grade, ceiling },
    );
  }

  const geom = normaliseGeometry(raw);
  // Validate eagerly so a bad fixture fails at parse time, not at first use.
  geometryAreaM2(geom);

  // `ARTEFACT_BRAND` is a type-only `unique symbol` (erased by Node's type
  // stripping), so the brand is asserted via cast, not written at runtime —
  // matching the idiom in phase3/caprebate-source-register.ts's `Cell<T>`.
  const artefact = {
    artefact_id: meta.artefact_id,
    kind: meta.kind,
    crs: raw.crs,
    grade,
    prov: {
      prov: DEFAULT_PROV_FOR_SOURCE_KIND[meta.source_kind],
      source_kind: meta.source_kind,
      grade,
      retrieved_at: meta.retrieved_at,
      locator: meta.locator,
      derived_from: [],
    },
  } as unknown as CartographicArtefact;
  GEOMETRY_STORE.set(artefact, geom);
  return artefact;
}

/* ------------------------------------------------------------------ *
 * 7. Licence permission — the three outcomes, one switch
 * ------------------------------------------------------------------ */

export type LicenceOutcome = 'NOT_CLEARED' | 'INTERNAL_CALCULATION_ONLY' | 'FULL_REPRODUCTION';

export type LicencePermission = {
  outcome: LicenceOutcome;
  /** May the geometry be used for anything at all (including arithmetic)? */
  allow_internal_calculation: boolean;
  /** May the geometry / a rendered map / a coordinate list appear in an outgoing report? */
  allow_report_reproduction: boolean;
  decided_by: string | null;
  decided_at: string | null;
  /**
   * Phase 132e. Where the decision was recorded, in plain words, so a reader
   * can go and check it. Optional: the hand-built permissions in the tests
   * (and any older caller) have no record, and that is fine — nothing in this
   * module reads this field to decide anything.
   */
  decision_record?: string | null;
  /** Phase 132e. The date the decision was built into this file (ISO date). Record only, never read to decide anything. */
  built_at?: string | null;
  notes: string;
};

function permissionFor(
  outcome: LicenceOutcome,
  over: Partial<Pick<LicencePermission, 'decided_by' | 'decided_at' | 'notes'>> = {},
): LicencePermission {
  const base = { decided_by: null, decided_at: null, notes: '', ...over };
  if (outcome === 'NOT_CLEARED') {
    return { ...base, outcome, allow_internal_calculation: false, allow_report_reproduction: false };
  }
  if (outcome === 'INTERNAL_CALCULATION_ONLY') {
    return { ...base, outcome, allow_internal_calculation: true, allow_report_reproduction: false };
  }
  return { ...base, outcome, allow_internal_calculation: true, allow_report_reproduction: true };
}

/**
 * THE ONE SWITCH. To move to outcome (a) or (c), change this constant —
 * nothing else in this file. Every function that needs a permission defaults
 * to reading it here.
 *
 * DECIDED, Phase 132e (built 16 September 2026). Until this phase the value
 * below was the same outcome, but only as an unconfirmed default. It is now a
 * recorded decision:
 *   - Decided by Lakhbir Dhillon, Head of Business Development. His answer "Yes" to "Switch on
 *     automatic site area from the land boundaries, without waiting for
 *     Ordnance Survey?" was read on 15 September 2026 (Phase 132c): internal
 *     calculation only, and boundary maps stay out of client reports.
 *   - Internal calculation: PERMITTED (allow_internal_calculation: true).
 *   - Showing the boundary, a map or its coordinates in a client report:
 *     NOT PERMITTED (allow_report_reproduction: false). HM Land Registry's
 *     published conditions would allow it with both attribution statements,
 *     but that is a separate decision and has not been taken.
 *
 * The fields are written out by name, on purpose, so the permission can be
 * read at a glance. The check straight after this constant makes sure the
 * written-out fields still agree with `permissionFor(outcome)`, so there is
 * still exactly one authoritative knob (the outcome), not two booleans that
 * could drift apart.
 *
 * WHAT THIS DOES NOT DO. It does not switch fetching on. Nothing in this file
 * fetches: DEFAULT_FETCHER still always refuses, and BOUNDARY_FETCHING_SWITCHED_ON
 * (§10) is still false. The real fetcher of HM Land Registry's INSPIRE Index
 * Polygons was built, and left switched off, by Phase 150 (24 September 2026)
 * at 09-app/backend/src/connectors/inspire.ts. The data protection officer's
 * question on small, logged test lookups was answered by Lakhbir on 25
 * September 2026 (yes, on five conditions), and Phase 151l (28 September 2026)
 * built the first download as a test lookup under them: `smoke HMLR_INSPIRE`
 * in the back end, which switches the fetcher on for its one call and never
 * touches this module. Switching fetching on for the application is Lakhbir's
 * decision; a PASS from that test lookup, which proves the file's shape, comes
 * first. Building footprints still wait on Ordnance Survey.
 */
export const CURRENT_LICENCE_PERMISSION: LicencePermission = {
  outcome: 'INTERNAL_CALCULATION_ONLY',
  allow_internal_calculation: true,
  allow_report_reproduction: false,
  decided_by: 'Lakhbir Dhillon, Head of Business Development',
  decided_at: '2026-09-15',
  decision_record:
    'Answer "Yes" in caprebate-questions.md, question "Switch on automatic site area from the land ' +
    'boundaries, without waiting for Ordnance Survey?", read 15 September 2026 (Phase 132c). Boundary ' +
    'maps in client reports: "Stay off". decided_at is the date the answer was read; the answer box ' +
    'itself carries no date.',
  built_at: '2026-09-16',
  notes:
    'Board item 12830205914. Internal calculation only: a site area may be worked out from a land ' +
    'boundary for our own checks, and the boundary itself (a map, an image or its coordinates) may not ' +
    'appear in a client report. Fetching stays off — it still needs the data protection officer\'s ' +
    'answer on the test lookup. The fetcher itself was built, switched off, by Phase 150 on 24 September 2026.',
};

// Guard: the written-out fields above must say exactly what the outcome says.
// If someone edits one boolean without the outcome (or the other way round),
// the module refuses to load rather than run with a contradictory permission.
{
  const expected = permissionFor(CURRENT_LICENCE_PERMISSION.outcome);
  if (
    expected.allow_internal_calculation !== CURRENT_LICENCE_PERMISSION.allow_internal_calculation ||
    expected.allow_report_reproduction !== CURRENT_LICENCE_PERMISSION.allow_report_reproduction
  ) {
    throw new Error(
      'CURRENT_LICENCE_PERMISSION is inconsistent: its allow_* fields do not match its outcome ' +
        `(${CURRENT_LICENCE_PERMISSION.outcome}). Change the outcome and both fields together.`,
    );
  }
}

/**
 * Phase 132e. What someone is asking to do with land boundary data. Only these
 * three exact values are recognised. Anything else — "not sure", undefined,
 * null, an empty string, a misspelling — is treated as unrecognised and
 * REFUSED, identically (rule N4: "not sure" and absent behave the same).
 */
export type BoundaryUsePurpose = 'INTERNAL_CALCULATION' | 'CLIENT_REPORT_DISPLAY' | 'FETCH';

export type BoundaryUseDecision = {
  permitted: boolean;
  /** The purpose as this module understood it. Every unrecognised input reads as 'UNRECOGNISED'. */
  purpose: BoundaryUsePurpose | 'UNRECOGNISED';
  /** A plain-English reason, suitable to show a person. Never echoes the raw input. */
  reason: string;
};

const RECOGNISED_PURPOSES: ReadonlySet<string> = new Set(['INTERNAL_CALCULATION', 'CLIENT_REPORT_DISPLAY', 'FETCH']);

/**
 * Phase 132e. Answers "may we use land boundary data for this?" without
 * throwing, so a screen or a back-end route can show the reason to a person.
 * It only reads the permission; it never fetches, stores or changes anything.
 *
 *   - INTERNAL_CALCULATION: permitted when the permission allows internal
 *     calculation (it does, as decided on 15 September 2026).
 *   - CLIENT_REPORT_DISPLAY: permitted only when the permission allows report
 *     reproduction (it does not).
 *   - FETCH: always refused while BOUNDARY_FETCHING_SWITCHED_ON is false,
 *     whatever the permission says. A permission governs what may be done
 *     with boundary data once we have it; it never switches fetching on.
 *   - anything else, including "not sure" and undefined: refused, with the
 *     same answer every time.
 */
export function checkBoundaryUse(
  purpose: unknown,
  permission: LicencePermission = CURRENT_LICENCE_PERMISSION,
): BoundaryUseDecision {
  if (typeof purpose !== 'string' || !RECOGNISED_PURPOSES.has(purpose)) {
    return {
      permitted: false,
      purpose: 'UNRECOGNISED',
      reason:
        'Refused: the use was not stated as one we recognise, so it is treated as not permitted. ' +
        'Say whether the boundary is for internal calculation, for showing in a client report, or for fetching.',
    };
  }
  if (purpose === 'INTERNAL_CALCULATION') {
    return permission.allow_internal_calculation === true
      ? {
          permitted: true,
          purpose,
          reason: 'Permitted: land boundaries may be used to work out a site area for our own internal checks.',
        }
      : {
          permitted: false,
          purpose,
          reason: `Refused: land boundaries may not be used for anything, not even internal calculation, under the current permission (${permission.outcome}).`,
        };
  }
  if (purpose === 'CLIENT_REPORT_DISPLAY') {
    return permission.allow_report_reproduction === true
      ? { permitted: true, purpose, reason: 'Permitted: the boundary may be shown in a client report, with both attribution statements.' }
      : {
          permitted: false,
          purpose,
          /* PHASE 151c, 25 September 2026. This said "a site area worked out from it may be reported", while the
             source register's HMLR_INSPIRE licence row says client_report false for everything from this source,
             the site area included. Lakhbir's decision of 15 September 2026 (decision_record above) settles the
             map — it stays out — and "internal calculation only"; it does not say whether the NUMBER may go in a
             client report. So both now say the same, the safe way round, and the number waits on his answer to the
             Word question "May the site area we work out from a land boundary go in a client's report?". */
          reason:
            'Refused: boundary maps stay out of client reports. The boundary may be used for internal ' +
            'calculation only. A site area worked out from it is for our own checks too, until Lakhbir decides ' +
            'whether the number may go in a client report. The map, an image of it and its coordinates never may.',
        };
  }
  // purpose === 'FETCH'
  return {
    permitted: false,
    purpose,
    reason:
      'Refused: fetching land boundaries is switched off. It still needs the data protection ' +
      "officer's answer on the small, logged test lookup.",
  };
}

export function assertInternalCalculationAllowed(permission: LicencePermission = CURRENT_LICENCE_PERMISSION): void {
  if (!permission.allow_internal_calculation) {
    throw new BoundaryImportError(
      'E_LICENCE_NOT_CLEARED',
      `Boundary geometry may not be used for any purpose — including internal site-area/coverage ` +
        `calculation — under the current licence outcome (${permission.outcome}).`,
      { permission },
    );
  }
}

/* ------------------------------------------------------------------ *
 * 8. DerivedScalar — the report-safe type. Numbers only, never geometry.
 * ------------------------------------------------------------------ */

declare const SCALAR_BRAND: unique symbol;

/**
 * A derived numeric output and its provenance. No permission check gates
 * reading `.value` off one of these — that is the point: a DerivedScalar can
 * never, by construction, hold a coordinate, so it is always safe to place in
 * any report channel regardless of the current LicencePermission.
 */
export type DerivedScalar<T> = {
  readonly [SCALAR_BRAND]: 'caprebate.boundary.derived_scalar.v1';
  readonly field_id: string;
  readonly value: T;
  readonly grade: Grade;
  readonly prov: BoundaryProvenance;
};

function scalar<T>(field_id: string, value: T, grade: Grade, derived_from: readonly string[]): DerivedScalar<T> {
  // `SCALAR_BRAND` is a type-only `unique symbol` (erased at runtime) — see the
  // matching note on CartographicArtefact construction above.
  return {
    field_id,
    value,
    grade,
    prov: { prov: 'DR', source_kind: 'COMPUTED', grade, retrieved_at: null, locator: null, derived_from },
  } as unknown as DerivedScalar<T>;
}

/**
 * DERIVES `site_area_m2` (area_m2, schema §1.C conventions — new field).
 *
 * Grade is inherited from the artefact, never upgraded to A: schema §0.5
 * explicitly warns against grading a derived figure A "because the
 * arithmetic is deterministic" — the arithmetic here is deterministic, but
 * the boundary itself is not: HM Land Registry title boundaries are *general
 * boundaries* under s.60 Land Registration Act 2002 (indicative, not an
 * exact legal line), so even a register-sourced polygon is capped at B, not
 * A. See the spec for the full reasoning and for when this might need to
 * drop further to C (ambiguous parcel selection) pending surveyor/conveyancer
 * sign-off.
 */
export function computeSiteArea(artefact: CartographicArtefact): DerivedScalar<number> {
  assertArtefactKind(artefact, 'PARCEL_BOUNDARY');
  assertComputableCrs(artefact.crs);
  const geom = requireGeometry(artefact);
  const areaM2 = round1(geometryAreaM2(geom));
  return scalar('site_area_m2', areaM2, artefact.grade, [artefact.artefact_id]);
}

/** DERIVES `building_footprint_m2` (area_m2 — new field, same treatment as site_area_m2). */
export function computeFootprintAreaM2(artefact: CartographicArtefact): DerivedScalar<number> {
  assertArtefactKind(artefact, 'BUILDING_FOOTPRINT');
  assertComputableCrs(artefact.crs);
  const geom = requireGeometry(artefact);
  const areaM2 = round1(geometryAreaM2(geom));
  return scalar('building_footprint_m2', areaM2, artefact.grade, [artefact.artefact_id]);
}

/**
 * DERIVES `building_coverage_ratio` (decimal, 0–1 — new field; deliberately
 * NOT typed `percent` per schema §0.2, to avoid the 0–1 vs 0–100 ambiguity a
 * ratio-named field would create under that type. See spec.)
 *
 * Guards: zero/negative site area and footprint-exceeds-site are both coded
 * errors, never a silently wrong or infinite ratio. The result's grade is the
 * worst of its two inputs' grades (schema §0.5 grade inheritance).
 */
export function computeBuildingCoverageRatio(
  siteArea: DerivedScalar<number>,
  footprintArea: DerivedScalar<number>,
): DerivedScalar<number> {
  if (siteArea.field_id !== 'site_area_m2') {
    throw new BoundaryImportError('E_WRONG_SCALAR_FIELD', `expected site_area_m2, got ${siteArea.field_id}`);
  }
  if (footprintArea.field_id !== 'building_footprint_m2') {
    throw new BoundaryImportError('E_WRONG_SCALAR_FIELD', `expected building_footprint_m2, got ${footprintArea.field_id}`);
  }
  if (siteArea.value <= 0) {
    throw new BoundaryImportError('E_ZERO_SITE_AREA', `site_area_m2 must be > 0, got ${siteArea.value}`, {
      site_area_m2: siteArea.value,
    });
  }
  if (footprintArea.value < 0) {
    throw new BoundaryImportError('E_NEGATIVE_AREA', `building_footprint_m2 must be >= 0, got ${footprintArea.value}`, {
      building_footprint_m2: footprintArea.value,
    });
  }
  if (footprintArea.value > siteArea.value) {
    throw new BoundaryImportError(
      'E_FOOTPRINT_EXCEEDS_SITE',
      `building_footprint_m2 (${footprintArea.value}) exceeds site_area_m2 (${siteArea.value}) — a building ` +
        `cannot cover more ground than its own site; check the two artefacts refer to the same parcel`,
      { building_footprint_m2: footprintArea.value, site_area_m2: siteArea.value },
    );
  }
  const ratio = round4(footprintArea.value / siteArea.value);
  const grade = worstGrade([siteArea.grade, footprintArea.grade]);
  return scalar('building_coverage_ratio', ratio, grade, [
    ...siteArea.prov.derived_from,
    ...footprintArea.prov.derived_from,
  ]);
}

/* ------------------------------------------------------------------ *
 * 9. Report-reproduction gate — the ONLY way geometry leaves this module
 *    as plain data.
 * ------------------------------------------------------------------ */

export type ReleasedGeometry = {
  artefact_id: string;
  kind: ArtefactKind;
  crs: CrsCode;
  polygons: readonly { exterior: RawRing; holes: readonly RawRing[] }[];
};

/**
 * Turn a CartographicArtefact back into plain, exportable ring data — for
 * example to render a map image into a client report. Defaults to
 * CURRENT_LICENCE_PERMISSION (§7): under outcome (a) or (b), this throws
 * E_LICENCE_NOT_CLEARED_FOR_REPRODUCTION and returns nothing. There is no
 * other function in this module that exposes raw coordinates — every other
 * consumer of an artefact (computeSiteArea, computeFootprintAreaM2) reads the
 * WeakMap for internal arithmetic only and never returns the rings.
 */
export function releaseGeometryForReport(
  artefact: CartographicArtefact,
  permission: LicencePermission = CURRENT_LICENCE_PERMISSION,
): ReleasedGeometry {
  if (!permission.allow_report_reproduction) {
    throw new BoundaryImportError(
      'E_LICENCE_NOT_CLEARED_FOR_REPRODUCTION',
      `Boundary geometry for artefact '${artefact.artefact_id}' may be used to compute derived numbers ` +
        `(site_area_m2, building_coverage_ratio) but may NOT be reproduced in an outgoing report under the ` +
        `current licence outcome (${permission.outcome}). Only DerivedScalar values may be placed in a report.`,
      { artefact_id: artefact.artefact_id, permission },
    );
  }
  const geom = requireGeometry(artefact);
  // Deep-copy so the caller cannot mutate what is sitting in GEOMETRY_STORE.
  return {
    artefact_id: artefact.artefact_id,
    kind: artefact.kind,
    crs: artefact.crs,
    polygons: geom.polygons.map((p) => ({
      exterior: p.exterior.map((pt) => [pt[0], pt[1]] as const),
      holes: p.holes.map((h) => h.map((pt) => [pt[0], pt[1]] as const)),
    })),
  };
}

/* ------------------------------------------------------------------ *
 * 10. Fetch surface — PURE. Decides what should be fetched; never fetches.
 * ------------------------------------------------------------------ */

export type BoundaryFetchRequest = {
  property_ref: string;
  title_number?: string;
  wants: readonly ArtefactKind[];
};

export type BoundaryFetchPlanItem = {
  kind: ArtefactKind;
  dataset: BoundarySourceKind;
  /** A documented locator TEMPLATE. Never dereferenced by this module. */
  locator: string;
};

export type BoundaryFetchPlan = {
  property_ref: string;
  items: readonly BoundaryFetchPlanItem[];
};

/**
 * PURE. Given a request, decides which datasets would need to be fetched and
 * what they would be fetched from — and returns that decision as inert data.
 * Contains no I/O of any kind. Two calls with the same input always produce
 * the same output.
 *
 * PHASE 133 (17 September 2026) — THE `/title/` LOCATOR BELOW DOES NOT MATCH
 * THE PUBLISHED DATA. HM Land Registry's INSPIRE Index Polygons carry no title
 * number: each polygon has its own Land Registry-INSPIRE ID, and one title can
 * have several polygons (findings: 04-phase-work/phase133/inspire-format-findings.md).
 * A title number cannot be used as a key into that data. The route from a
 * property to its polygon is the spatial join, `findInspirePolygonForPoint`
 * (§14): a British National Grid point inside exactly one polygon. That join is
 * deliberately NOT wired in here or into any fetch path. The locator is left
 * as it was so existing callers and tests are unchanged. Getting the point
 * (from an address lookup or HM Land Registry's own service) is a lookup
 * nobody has allowed.
 */
export function planBoundaryFetch(request: BoundaryFetchRequest): BoundaryFetchPlan {
  const key = request.title_number ?? request.property_ref;
  const items: BoundaryFetchPlanItem[] = request.wants.map((kind) =>
    kind === 'PARCEL_BOUNDARY'
      ? { kind, dataset: 'HMLR_INSPIRE_INDEX_POLYGON', locator: `hmlr-inspire-index-polygon://title/${key}` }
      : { kind, dataset: 'OS_MASTERMAP_BUILDING_FOOTPRINT', locator: `os-mastermap-topo://footprint/${key}` },
  );
  return { property_ref: request.property_ref, items };
}

export type RawBoundaryPayload = {
  geometry: RawBoundaryGeometry;
  meta: Omit<ParseBoundaryInput, 'kind'>;
};

/** Given a single plan item, produce the payload for it. The only place I/O could ever happen — and doesn't, by default. */
export type BoundaryFetcher = (item: BoundaryFetchPlanItem) => Promise<RawBoundaryPayload>;

/**
 * Phase 132e. A named, readable statement that fetching is OFF, read by
 * checkBoundaryUse's reason.
 *
 * PHASE 150 (24 September 2026) MADE IT A REAL SWITCH. The real fetcher,
 * 09-app/backend/src/connectors/inspire.ts, reads this constant before it does
 * anything, and while it is false it refuses (E_FETCHING_SWITCHED_OFF) with
 * nothing sent. DEFAULT_FETCHER below is unchanged and still always throws, so
 * with no fetcher injected, setting this true would still fetch nothing.
 * Turning fetching on is this one word plus injecting that fetcher. "Can we
 * make a few small, logged test lookups to check a data connector works?" was
 * answered on 25 September 2026; the first download runs as a test lookup
 * (Phase 151l, `smoke HMLR_INSPIRE`), and turning this on is Lakhbir's.
 */
export const BOUNDARY_FETCHING_SWITCHED_ON = false as const;

/**
 * THE DEFAULT. Always throws. Injecting a different fetcher is a deliberate,
 * separate act of writing new code (a real HTTP/file call) — it is NOT
 * something that can happen by changing CURRENT_LICENCE_PERMISSION. That
 * constant governs what may be done with geometry *once obtained*; this
 * default governs whether the module can obtain any in the first place, and
 * it always says no until someone deliberately replaces it.
 */
export const DEFAULT_FETCHER: BoundaryFetcher = async (item: BoundaryFetchPlanItem): Promise<RawBoundaryPayload> => {
  throw new BoundaryImportError(
    'E_LICENCE_NOT_CLEARED',
    `No live boundary data pull is implemented or permitted. Requested dataset '${item.dataset}' at ` +
      `'${item.locator}' was NOT fetched — this is the default fetcher, injected because none was supplied, ` +
      `and it never performs network or filesystem I/O.`,
    { item },
  );
};

/**
 * Orchestrates plan -> fetch -> parse. Uses DEFAULT_FETCHER (always throws)
 * unless a real fetcher is explicitly injected. Also checks
 * `permission.allow_internal_calculation` before doing anything.
 */
export async function fetchAndImportBoundary(
  request: BoundaryFetchRequest,
  opts: { fetcher?: BoundaryFetcher; permission?: LicencePermission } = {},
): Promise<Readonly<Record<string, CartographicArtefact>>> {
  const permission = opts.permission ?? CURRENT_LICENCE_PERMISSION;
  assertInternalCalculationAllowed(permission);
  const fetcher = opts.fetcher ?? DEFAULT_FETCHER;
  const plan = planBoundaryFetch(request);
  const out: Record<string, CartographicArtefact> = {};
  for (const item of plan.items) {
    const payload = await fetcher(item);
    out[item.kind] = parseBoundaryGeometry(
      payload.geometry,
      { ...payload.meta, artefact_id: `${request.property_ref}:${item.kind}`, kind: item.kind },
      permission,
    );
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 11. Licensed reference table stubs — empty, clearly labelled
 * ------------------------------------------------------------------ */

export type ReferenceTableStub<T> = {
  dataset_id: string;
  loaded: false;
  rows: readonly T[];
  notes: string;
};

function emptyStub<T>(dataset_id: string, notes: string): ReferenceTableStub<T> {
  return Object.freeze({ dataset_id, loaded: false, rows: Object.freeze([]) as readonly T[], notes });
}

/** Empty. No data pulled, and none is kept here: the Phase 150 fetcher reads a council's file for one point and keeps only that polygon. */
export const HMLR_INSPIRE_INDEX_POLYGON_TABLE: ReferenceTableStub<unknown> = emptyStub(
  'HMLR_INSPIRE_INDEX_POLYGON',
  'Empty stub — board item 12830205914 licence pending. No live rows have ever been loaded here.',
);

/** Empty. No data pulled. Separate licence/dataset from the parcel boundary (Ordnance Survey, not HMLR) — see spec. */
export const OS_MASTERMAP_BUILDING_FOOTPRINT_TABLE: ReferenceTableStub<unknown> = emptyStub(
  'OS_MASTERMAP_BUILDING_FOOTPRINT',
  'Empty stub — licence for this dataset has not even been requested yet, separately from the land-boundary licence. No live rows have ever been loaded here.',
);

/* ------------------------------------------------------------------ *
 * 12. Sources note — the two attribution statements (Phase 132e)
 * ------------------------------------------------------------------ */

/**
 * The sources note for HM Land Registry's INSPIRE Index Polygons. Both
 * statements are copied word for word from HM Land Registry's conditions of
 * use, read on 16 September 2026 at
 * https://use-land-property-data.service.gov.uk/datasets/inspire (the wording
 * matches the reading of 13 and 15 September 2026 in the board item exports).
 *
 * HM Land Registry's statement is needed whenever the data is reused — which
 * includes a site area worked out from a polygon. The Ordnance Survey
 * statement is needed whenever the polygons themselves (their x, y
 * coordinates) are reused; we carry both every time, as the safe course.
 * The "[year of supply or date of publication]" placeholder is HM Land
 * Registry's own; fill it from the month of supply recorded against the figure.
 *
 * Text only. Having this note does not permit showing a boundary in a client
 * report (CURRENT_LICENCE_PERMISSION still says no) and does not switch
 * fetching on.
 */
export const INSPIRE_INDEX_POLYGON_SOURCES_NOTE = Object.freeze({
  dataset: 'HM Land Registry INSPIRE Index Polygons',
  licence: 'Open Government Licence v3.0',
  hmlr_attribution_statement:
    'This information is subject to Crown copyright and database rights [year of supply or date of publication] ' +
    'and is reproduced with the permission of HM Land Registry.',
  ordnance_survey_attribution_statement:
    'The polygons (including the associated geometry, namely x, y co-ordinates) are subject to Crown copyright ' +
    'and database rights [year of supply or date of publication] Ordnance Survey AC0000851063.',
  conditions_link: 'https://use-land-property-data.service.gov.uk/datasets/inspire/#conditions',
  wording_read_at: 'https://use-land-property-data.service.gov.uk/datasets/inspire',
  wording_read_on: '2026-09-16',
});

/* ------------------------------------------------------------------ *
 * 13. Translation from the PUBLISHED INSPIRE Index Polygon shape
 *     (Phase 133, 17 September 2026)
 *
 * HM Land Registry's own pages were read on 17 September 2026 (findings in
 * 04-phase-work/phase133/inspire-format-findings.md). Three things they say
 * differ from what §4 assumed:
 *
 *   1. Delivery is GML ("The files are published as GML files"; ISO metadata
 *      distribution format "GML 3.2.1"), one file per local authority, not a
 *      ready-made `{ exterior, holes }` record. A polygon on the boundary
 *      between two authorities "will appear in both local authority data
 *      files", so the same polygon can arrive twice.
 *   2. The identifier is the Land Registry-INSPIRE ID, one per polygon, NOT
 *      the title number: "Each registered title will have a single title
 *      number, which may contain several separate polygons. Each individual
 *      polygon will have a separate Land Registry-INSPIRE ID." The INSPIRE
 *      subset carries "the identifier, the create date and the polygon last
 *      updated date" only — no title number.
 *   3. The CRS is British National Grid (EPSG:27700), but HM Land Registry's
 *      published metadata writes it as the OGC URI
 *      `http://www.opengis.net/def/crs/EPSG/0/27700`, which §3 would refuse as
 *      E_UNKNOWN_CRS if passed straight through.
 *
 * WHAT HM LAND REGISTRY DOES NOT STATE on the pages read: the XML element
 * names inside the GML files, the exact srsName string on each feature, or
 * whether interior rings (holes) occur. So this translation starts AFTER XML
 * parsing: it takes one plain record per polygon, with rings as GML 3.2.1
 * `posList` text (space-separated "x y x y ..." pairs — the GML 3.2.1
 * standard encoding, not an HM Land Registry statement). A developer writing
 * the real fetcher must confirm the element names against a file HM Land
 * Registry supplies under the licence, and extract into this record shape.
 *
 * Pure: no I/O, no fetching. It does not switch fetching on — DEFAULT_FETCHER
 * still always throws and BOUNDARY_FETCHING_SWITCHED_ON is still false.
 * Every test fixture for it is invented.
 * ------------------------------------------------------------------ */

/** One INSPIRE Index Polygon, after XML extraction. One record = one polygon = one INSPIRE ID. */
export type InspireIndexPolygonRecord = {
  /** Land Registry-INSPIRE ID. Required. This is NOT a title number. */
  readonly inspire_id: string;
  /** The CRS as the file states it, e.g. 'http://www.opengis.net/def/crs/EPSG/0/27700'. */
  readonly srs_name: string;
  /** GML 3.2.1 posList text of the exterior ring: "x1 y1 x2 y2 ...". */
  readonly exterior_pos_list: string;
  /** GML 3.2.1 posList text of each interior ring (hole), if any. */
  readonly interior_pos_lists?: readonly string[];
};

export type InspireTranslation = {
  /** Ready for parseBoundaryGeometry. CRS normalised to 'EPSG:<code>'. */
  readonly geometry: RawBoundaryGeometry;
  /** The distinct INSPIRE IDs making up the geometry, sorted. Never title numbers. */
  readonly inspire_ids: readonly string[];
  /** A locator keyed by INSPIRE ID(s), for ParseBoundaryInput.locator. */
  readonly locator: string;
  /** How many exact duplicate records (same ID, same rings) were dropped. */
  readonly duplicates_dropped: number;
};

const EPSG_CRS_FORMS: readonly RegExp[] = [
  /^EPSG:(\d+)$/,
  /^https?:\/\/www\.opengis\.net\/def\/crs\/EPSG\/0\/(\d+)$/, // as in HM Land Registry's published metadata
  /^urn:ogc:def:crs:EPSG:[^:]*:(\d+)$/, // OGC URN form (listed in spec §6 item 2; not stated by HM Land Registry)
];

/**
 * Rewrites the recognised spellings of an EPSG code to 'EPSG:<code>'. It does
 * NOT make any CRS computable: the code still goes through
 * assertComputableCrs (§3) unchanged, so a 4326 URI is still refused as
 * degrees. An unrecognised spelling is refused here, not passed through.
 */
export function normaliseEpsgCrs(srsName: string): CrsCode {
  const trimmed = typeof srsName === 'string' ? srsName.trim() : '';
  for (const form of EPSG_CRS_FORMS) {
    const m = form.exec(trimmed);
    if (m) return `EPSG:${Number(m[1])}`;
  }
  throw new BoundaryImportError(
    'E_UNKNOWN_CRS',
    `CRS '${String(srsName)}' is not a recognised spelling of an EPSG code. Refusing rather than guessing.`,
    { srs_name: srsName },
  );
}

/** Parses GML 3.2.1 posList text ("x y x y ...", 2D) into a ring. */
function parsePosList(posList: string, where: Record<string, unknown>): RawRing {
  const tokens = typeof posList === 'string' ? posList.trim().split(/\s+/).filter((t) => t !== '') : [];
  if (tokens.length % 2 !== 0) {
    throw new BoundaryImportError('E_INVALID_COORDINATE', `posList has an odd number of values (${tokens.length}); expected x y pairs`, where);
  }
  const ring: [number, number][] = [];
  for (let i = 0; i < tokens.length; i += 2) {
    const x = Number(tokens[i]);
    const y = Number(tokens[i + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new BoundaryImportError('E_INVALID_COORDINATE', `posList value is not a finite number at pair ${i / 2}`, where);
    }
    ring.push([x, y]);
  }
  if (ring.length < 3) {
    throw new BoundaryImportError('E_DEGENERATE_RING', `a ring needs at least 3 points, got ${ring.length}`, { ...where, point_count: ring.length });
  }
  return ring;
}

const sameRing = (a: RawRing, b: RawRing): boolean =>
  a.length === b.length && a.every((p, i) => p[0] === b[i][0] && p[1] === b[i][1]);

/**
 * Translates published-shape INSPIRE Index Polygon records into one
 * RawBoundaryGeometry for one site.
 *   - one distinct polygon -> 'Polygon'; several -> 'MultiPolygon' (a title,
 *     or a site, can be several separate polygons, each its own INSPIRE ID)
 *   - the same INSPIRE ID twice with identical rings (a polygon on a council
 *     boundary appears in both councils' files) is kept once, never
 *     double-counted; the same ID with different rings is refused
 *   - every record must carry an INSPIRE ID and all must share one CRS
 */
export function inspirePolygonsToRawBoundaryGeometry(records: readonly InspireIndexPolygonRecord[]): InspireTranslation {
  if (!Array.isArray(records) || records.length === 0) {
    throw new BoundaryImportError('E_EMPTY_GEOMETRY', 'no INSPIRE Index Polygon records to translate');
  }
  const byId = new Map<string, InternalPolygon>();
  let crs: CrsCode | null = null;
  let duplicates = 0;
  for (const rec of records) {
    const id = rec && typeof rec.inspire_id === 'string' ? rec.inspire_id.trim() : '';
    if (id === '') {
      throw new BoundaryImportError(
        'E_MISSING_INSPIRE_ID',
        'record has no Land Registry-INSPIRE ID. The INSPIRE Index Polygons are keyed by INSPIRE ID, one per polygon; a title number is not a substitute.',
      );
    }
    const recCrs = normaliseEpsgCrs(rec.srs_name);
    if (crs === null) crs = recCrs;
    else if (crs !== recCrs) {
      throw new BoundaryImportError('E_MIXED_CRS', `records use more than one CRS (${crs} and ${recCrs}); refusing to combine them`, {
        inspire_id: id,
      });
    }
    const polygon: InternalPolygon = {
      exterior: parsePosList(rec.exterior_pos_list, { inspire_id: id, ring: 'exterior' }),
      holes: (rec.interior_pos_lists ?? []).map((pl, i) => parsePosList(pl, { inspire_id: id, ring: `interior ${i}` })),
    };
    const seen = byId.get(id);
    if (seen) {
      const identical =
        sameRing(seen.exterior, polygon.exterior) &&
        seen.holes.length === polygon.holes.length &&
        seen.holes.every((h, i) => sameRing(h, polygon.holes[i]));
      if (!identical) {
        throw new BoundaryImportError(
          'E_CONFLICTING_DUPLICATE_POLYGON',
          `INSPIRE ID ${id} appears more than once with different geometry; refusing to choose one`,
          { inspire_id: id },
        );
      }
      duplicates += 1;
      continue;
    }
    byId.set(id, polygon);
  }
  const ids = [...byId.keys()].sort();
  const parts = ids.map((id) => {
    const p = byId.get(id) as InternalPolygon;
    return p.holes.length > 0 ? { exterior: p.exterior, holes: p.holes } : { exterior: p.exterior };
  });
  const geometry: RawBoundaryGeometry =
    parts.length === 1
      ? { type: 'Polygon', crs: crs as CrsCode, ...parts[0] }
      : { type: 'MultiPolygon', crs: crs as CrsCode, polygons: parts };
  return {
    geometry,
    inspire_ids: ids,
    locator: `hmlr-inspire-index-polygon://inspire-id/${ids.join(',')}`,
    duplicates_dropped: duplicates,
  };
}

/* ------------------------------------------------------------------ *
 * 14. Spatial join: a point -> the INSPIRE polygon containing it
 *     (Phase 133, 17 September 2026). BUILT AND SWITCHED OFF.
 *
 * The published INSPIRE data carries no title number (§13), so a property can
 * only be matched to its polygon spatially: take a British National Grid
 * point for the property (easting, northing — e.g. an address point) and
 * find the polygon that contains it.
 *
 * Rules, all refusals rather than guesses:
 *   - exactly one polygon contains the point strictly inside -> that INSPIRE ID
 *   - none -> E_NO_FREEHOLD_POLYGON (a leasehold-only site, unregistered land,
 *     or the wrong point: the data covers freehold only)
 *   - more than one -> E_AMBIGUOUS_POLYGON, listing the candidates; never
 *     picks one (overlapping polygons exist in HM Land Registry's data)
 *   - the point lies exactly on any ring edge or vertex (a shared edge, an
 *     outer edge, or a hole's edge) -> E_AMBIGUOUS_POLYGON; never silently
 *     assigned to one side
 *   - a point inside a hole (inner ring) is not inside that polygon
 *   - absent, non-number or non-finite easting/northing -> E_INVALID_POINT,
 *     never defaulted to 0 (rule N4)
 *   - polygons not in EPSG:27700 -> E_UNKNOWN_CRS / E_CRS_NOT_PROJECTED, since
 *     the point is in British National Grid
 *
 * PURE: no I/O. NOT wired into planBoundaryFetch, fetchAndImportBoundary or
 * any fetcher. Getting the point itself — from an address lookup's
 * coordinates or from HM Land Registry's own service — is a lookup nobody has
 * allowed. DEFAULT_FETCHER still always throws; BOUNDARY_FETCHING_SWITCHED_ON
 * is still false.
 * ------------------------------------------------------------------ */

/** A point in British National Grid (EPSG:27700), metres. */
export type BngPoint = { readonly easting: number; readonly northing: number };

export type InspirePointMatch =
  | { readonly matched: true; readonly inspire_id: string }
  | {
      readonly matched: false;
      readonly code: 'E_INVALID_POINT' | 'E_NO_FREEHOLD_POLYGON' | 'E_AMBIGUOUS_POLYGON';
      /** INSPIRE IDs that contain or touch the point. Empty unless ambiguous. */
      readonly candidates: readonly string[];
      readonly reason: string;
    };

/** Exactly on segment a-b (collinear and within its bounding box). Exact arithmetic, no tolerance. */
function onSegment(px: number, py: number, a: readonly [number, number], b: readonly [number, number]): boolean {
  const cross = (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]);
  if (cross !== 0) return false;
  return px >= Math.min(a[0], b[0]) && px <= Math.max(a[0], b[0]) && py >= Math.min(a[1], b[1]) && py <= Math.max(a[1], b[1]);
}

function ringTouches(px: number, py: number, ring: RawRing): boolean {
  const n = ring.length;
  for (let i = 0; i < n; i++) if (onSegment(px, py, ring[i], ring[(i + 1) % n])) return true;
  return false;
}

/** Even-odd ray cast. Only meaningful once ringTouches has returned false. */
function ringContains(px: number, py: number, ring: RawRing): boolean {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Finds the INSPIRE polygon containing a British National Grid point.
 * `polygons` is the output of inspirePolygonsToRawBoundaryGeometry (§13):
 * its geometry parts are in the same order as its inspire_ids.
 */
export function findInspirePolygonForPoint(point: unknown, polygons: InspireTranslation): InspirePointMatch {
  const p = point as Partial<BngPoint> | null | undefined;
  const e = p && typeof p === 'object' ? p.easting : undefined;
  const nth = p && typeof p === 'object' ? p.northing : undefined;
  if (typeof e !== 'number' || typeof nth !== 'number' || !Number.isFinite(e) || !Number.isFinite(nth)) {
    return {
      matched: false,
      code: 'E_INVALID_POINT',
      candidates: [],
      reason: 'Refused: the point has no usable easting and northing. A missing or unreadable coordinate is never treated as 0.',
    };
  }
  if (!polygons || !polygons.geometry || !Array.isArray(polygons.inspire_ids)) {
    throw new BoundaryImportError('E_EMPTY_GEOMETRY', 'no translated INSPIRE polygons to search');
  }
  assertComputableCrs(polygons.geometry.crs);
  const parts: readonly RawPolygonPart[] =
    polygons.geometry.type === 'Polygon' ? [polygons.geometry] : polygons.geometry.polygons;
  if (parts.length === 0 || parts.length !== polygons.inspire_ids.length) {
    throw new BoundaryImportError(
      'E_EMPTY_GEOMETRY',
      `translated polygons and INSPIRE IDs do not line up (${parts.length} parts, ${polygons.inspire_ids.length} IDs)`,
    );
  }
  const touching: string[] = [];
  const containing: string[] = [];
  parts.forEach((part, i) => {
    const id = polygons.inspire_ids[i];
    const rings = [part.exterior, ...(part.holes ?? [])];
    if (rings.some((r) => ringTouches(e, nth, r))) {
      touching.push(id);
      return;
    }
    if (ringContains(e, nth, part.exterior) && !(part.holes ?? []).some((h) => ringContains(e, nth, h))) {
      containing.push(id);
    }
  });
  if (touching.length > 0) {
    return {
      matched: false,
      code: 'E_AMBIGUOUS_POLYGON',
      candidates: [...new Set([...touching, ...containing])].sort(),
      reason: 'Refused: the point lies exactly on a polygon edge, so it cannot be assigned to one polygon without guessing.',
    };
  }
  if (containing.length > 1) {
    return {
      matched: false,
      code: 'E_AMBIGUOUS_POLYGON',
      candidates: [...containing].sort(),
      reason: 'Refused: the point is inside more than one polygon. None is picked; a person must decide.',
    };
  }
  if (containing.length === 0) {
    return {
      matched: false,
      code: 'E_NO_FREEHOLD_POLYGON',
      candidates: [],
      reason:
        'Refused: no freehold polygon contains the point. The site may be leasehold only, unregistered, ' +
        'or the point may be wrong.',
    };
  }
  return { matched: true, inspire_id: containing[0] };
}
