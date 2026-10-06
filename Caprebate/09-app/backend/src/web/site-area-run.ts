/**
 * THE SITE AREA'S CALLER: "RUN THE RESEARCH", AFTER SIGNING — AND ITS LINE ON THE RESEARCH PANEL. Phase 151c,
 * 25 September 2026.
 *
 * Phase 151a built `siteAreaFromLandBoundary` (src/connectors/site-area.ts) and left it with nothing calling it. This
 * file is the one caller. It runs on the operator's one click, the same way the paid lookups do (src/web/research.ts):
 * the operator picks the moment, not the calls, and nothing refuses and nothing throws.
 *
 * FOR EACH OF THE CLIENT'S PROPERTIES, ON THE CLICK:
 *   · the councils — the postcode's own council from the ONS table (`councilOfPostcode`), then every neighbouring
 *     council a person added on the property page, for a site on a council boundary (migration 052);
 *   · the point — the latest easting and northing a person entered on the property page, else Homedata's own easting
 *     and northing after signing (`homedataPointOf`). Homedata's latitude and longitude stay refused while
 *     HOMEDATA_COORDINATE_DATUM is null;
 *   · the grid — CAPREBATE_OSTN15_FILE, read only when a point is a latitude and longitude; the store —
 *     CAPREBATE_INSPIRE_STORE_DIR. Either missing or unreadable is not an error: the grid's absence refuses a latitude
 *     and longitude, the store's makes every lookup download.
 *
 * WHEN IT MAY RUN. The land boundary is a FREE source (TIER_BY_SOURCE), so it waits on the privacy notice like every
 * free lookup, and on the client's own "answer it myself" choice (Word answer 180). AND IT RUNS AFTER SIGNING: the
 * point it needs comes from the paid address lookup or from a person working the signed client, so before the letter
 * is signed nothing is asked. Above all three sits the switch, BOUNDARY_FETCHING_SWITCHED_ON, which is false: switched
 * off, the line says so and the site area stays asked. This file opens nothing and switches nothing on.
 *
 * ONE LINE IN WORDS FOR EVERY OUTCOME STATE, per property: switched off; waiting (the letter, the notice, or the
 * client's choice); not permitted; no point; no council; ready for the next click; stored; already held; not found.
 * The panel draws the lines afresh each time, from the switch, the gates and what is held, so no network call is made
 * to draw a page. Only an outcome where the land boundary was actually asked — stored, already held, not found — is
 * kept (site_area_runs), so the panel can still say it after the page reloads.
 *
 * WHAT NEVER APPEARS HERE: the polygon, a map of it, or any coordinate from it. A line carries a number, a grade, the
 * councils read and a reason.
 */
import type { Db } from '../db.ts';
import type { Actor } from '../authz.ts';
import type { AuditLog } from '../audit.ts';
import { BOUNDARY_FETCHING_SWITCHED_ON } from '../../../../04-phase-work/phase9/caprebate-boundary-import.ts';
import {
  councilOfPostcode, homedataPointOf, planSiteArea, siteAreaFromLandBoundary, SITE_AREA_SOURCE_ID,
  type SiteAreaInput, type SiteAreaOutcome, type SiteAreaState,
} from '../connectors/site-area.ts';
import { ostn15Grid, type Ostn15Grid } from '../connectors/ostn15.ts';
import { TITLE_BOUNDARY_LABEL, TITLE_BOUNDARY_SOURCE_ID } from '../connectors/title-boundary.ts';
import { inspireStoreFromEnv, type InspireFileStore } from '../connectors/inspire-store.ts';
import type { RateLimiter, Transport } from '../connectors/http.ts';
import { DECLINED_LINE } from './address-check.ts';
import { postcodeStore } from './postcode.ts';
import type { PostcodeStore } from './postcode-port.ts';

/** Every state a site area line can be in: the function's own seven, and two that belong to the click. */
export type SiteAreaLineState = SiteAreaState | 'WAITING' | 'READY';

export type SiteAreaLine = {
  readonly property_id: string;
  /** The property's name, as the client page shows it. */
  readonly property: string;
  readonly state: SiteAreaLineState;
  /** What a person reads. Never empty, for any state. */
  readonly words: string;
  readonly site_area_m2: number | null;
  readonly grade: string | null;
  /** When the land boundary was last asked for this property; null when it never has been. */
  readonly at: string | null;
};

/** The gates as they stand for this client, read by the caller (src/web/research.ts) and never re-decided here. */
export type SiteAreaGates = {
  readonly free_gate_open: boolean;
  readonly engagement_signed: boolean;
  /** The client chose to answer the property questions themselves (Word answer 180). */
  readonly declined: boolean;
};

/**
 * WHERE THE GRID, THE STORE AND THE POSTCODE TABLE COME FROM. Each absent reads the server's own setting. A test
 * passes its own; nothing outside a test does.
 */
export type SiteAreaSetup = {
  /** TESTS ONLY. Absent, BOUNDARY_FETCHING_SWITCHED_ON is read, and it is false. */
  readonly switched_on?: boolean;
  readonly postcodeStore?: PostcodeStore | null;
  readonly grid?: Ostn15Grid | null;
  readonly fileStore?: InspireFileStore | null;
  readonly env?: Record<string, string | undefined>;
};

/** How a download would reach HM Land Registry on this click: research.ts's `outside`, or absent — then nothing can. */
export type SiteAreaOutside = {
  readonly transport: Transport;
  readonly limiter?: RateLimiter;
  readonly sleep?: (ms: number) => Promise<void>;
};

type PropertyRow = { readonly id: string; readonly label: string; readonly postcode: string | null };

/* ------------------------------------------------------------------ what a person entered (migration 052) */

export type EnteredPoint = { readonly easting: number; readonly northing: number; readonly entered_by: string; readonly entered_at: string };
export type EnteredCouncil = { readonly lad_code: string; readonly entered_by: string; readonly entered_at: string };

/** The latest point a person entered for this property, or null. */
export function enteredPoint(db: Db, property_id: string): EnteredPoint | null {
  return db.get<EnteredPoint>(
    "SELECT easting, northing, entered_by, entered_at FROM site_area_inputs WHERE property_id = ? AND kind = 'POINT' " +
      'ORDER BY entered_at DESC, rowid DESC LIMIT 1',
    [property_id],
  ) ?? null;
}

/** Every neighbouring council a person added for this property, first added first. */
export function enteredCouncils(db: Db, property_id: string): EnteredCouncil[] {
  return db.all<EnteredCouncil>(
    "SELECT lad_code, entered_by, entered_at FROM site_area_inputs WHERE property_id = ? AND kind = 'NEIGHBOUR_COUNCIL' " +
      'ORDER BY entered_at ASC, rowid ASC',
    [property_id],
  );
}

/* ------------------------------------------------------------------ the input for one property */

const isDegrees = (p: unknown): boolean => p !== null && typeof p === 'object' && ('latitude' in p || 'longitude' in p);

/** The grid, read only when it is needed. A file that cannot be read is the same as none: a latitude is refused. */
function gridFor(point: unknown, setup: SiteAreaSetup): Ostn15Grid | null {
  if (!isDegrees(point)) return null;
  if (setup.grid !== undefined) return setup.grid;
  try { return ostn15Grid(setup.env); } catch { return null; }
}

function storeFor(setup: SiteAreaSetup): InspireFileStore | null {
  if (setup.fileStore !== undefined) return setup.fileStore;
  try { return inspireStoreFromEnv(setup.env); } catch { return null; }
}

type Prepared = {
  readonly input: Omit<SiteAreaInput, 'actor_id' | 'actor_role' | 'claim_id' | 'gate'>;
  /** Where the point came from, for the line. */
  readonly point_from: 'PERSON' | 'HOMEDATA' | null;
  /** Why the postcode gave no council, when it gave none. */
  readonly postcode_why: string | null;
};

function prepare(db: Db, business_id: string, p: PropertyRow, setup: SiteAreaSetup): Prepared {
  const store = setup.postcodeStore === undefined ? postcodeStore() : setup.postcodeStore;
  const own = councilOfPostcode(p.postcode, store);
  const lad_codes = [...(own.ok ? [own.lad_code] : []), ...enteredCouncils(db, p.id).map((c) => c.lad_code)];
  const person = enteredPoint(db, p.id);
  const homedata = person === null ? homedataPointOf(db, business_id, p.id) : null;
  const point = person !== null ? { easting: person.easting, northing: person.northing } : homedata;
  return {
    input: {
      business_id, property_id: p.id, lad_codes, point,
      ...(setup.switched_on === undefined ? {} : { switched_on: setup.switched_on }),
    },
    point_from: person !== null ? 'PERSON' : homedata !== null ? 'HOMEDATA' : null,
    postcode_why: own.ok ? null : own.why,
  };
}

const FROM_WORDS = { PERSON: ' We use the point entered on the property page.', HOMEDATA: ' We use the easting and northing from the paid address lookup.' } as const;

/**
 * THE GATES, IN WORDS, or null when they are open. The client's own choice first (it is theirs and it is final), then
 * the signed letter, then the privacy notice.
 */
export function siteAreaWaits(g: SiteAreaGates): string | null {
  if (g.declined) return DECLINED_LINE;
  if (!g.engagement_signed) {
    return 'Waits until the engagement letter is signed. The point comes from the paid address lookup or from a ' +
      'person, after signing. Nothing was read or sent, and the site area stays asked.';
  }
  if (!g.free_gate_open) {
    return 'Waits until our privacy notice is published, like the other free lookups. Nothing was read or sent, and ' +
      'the site area stays asked.';
  }
  return null;
}

/** An outcome of the function, as a line. The sentence is the function's, with where the point came from and what to do. */
function lineOf(p: PropertyRow, o: SiteAreaOutcome, prep: Prepared, at: string | null): SiteAreaLine {
  let words = o.why;
  if (o.state === 'NO_POINT') words += ' A person can enter its easting and northing on the property page.';
  if (o.state === 'NO_COUNCIL' && prep.input.lad_codes.length === 0 && prep.postcode_why !== null) {
    words = `We do not know which council the property is in: ${prep.postcode_why} A person can add the council on the ` +
      'property page. The site area stays asked.';
  }
  if ((o.state === 'STORED' || o.state === 'NOT_FOUND') && prep.point_from !== null) words += FROM_WORDS[prep.point_from];
  return { property_id: p.id, property: p.label, state: o.state, words, site_area_m2: o.site_area_m2, grade: o.grade, at };
}

function properties(db: Db, business_id: string): PropertyRow[] {
  return db.all<PropertyRow>('SELECT id, label, postcode FROM properties WHERE business_id = ? ORDER BY created_at ASC, id ASC', [business_id]);
}

/**
 * WHAT THE NEXT CLICK WOULD DO, WITHOUT DOING IT: the switch, the gates, then every check before a download. No
 * network, no write. A line that is ready says so and names the councils whose files would be read.
 */
function preview(db: Db, business_id: string, p: PropertyRow, gates: SiteAreaGates, setup: SiteAreaSetup): SiteAreaLine {
  const prep = prepare(db, business_id, p, setup);
  const plan = planSiteArea({ db, grid: gridFor(prep.input.point, setup) }, { ...prep.input, actor_id: null, claim_id: null, gate: gates });
  if (!plan.ready && plan.outcome.state === 'SWITCHED_OFF') return lineOf(p, plan.outcome, prep, null);
  const waits = siteAreaWaits(gates);
  if (waits !== null) return { property_id: p.id, property: p.label, state: 'WAITING', words: waits, site_area_m2: null, grade: null, at: null };
  if (!plan.ready) return lineOf(p, plan.outcome, prep, null);
  return {
    property_id: p.id, property: p.label, state: 'READY',
    words: `Ready: the land boundary will be read the next time the research is run.${plan.which}${prep.point_from === null ? '' : FROM_WORDS[prep.point_from]}`,
    site_area_m2: null, grade: null, at: null,
  };
}

/** The site area held for a property, as a line, or null when none is held. HM Land Registry's land boundary first;
 *  PHASE 156f (B4): else the area from the title outline Homedata sold on the paid address lookup. */
function held(db: Db, business_id: string, p: PropertyRow): SiteAreaLine | null {
  const r = db.get<{ fields_json: string; obtained_at: string }>(
    'SELECT fields_json, obtained_at FROM register_records WHERE business_id = ? AND source_id = ? AND entity_id = ?',
    [business_id, SITE_AREA_SOURCE_ID, `property:${p.id}`],
  );
  if (r === undefined) return heldFromTitleOutline(db, business_id, p);
  let area: number | null = null; let grade: string | null = null;
  try {
    const f = JSON.parse(r.fields_json) as Record<string, unknown>;
    area = typeof f['site_area_m2'] === 'number' ? f['site_area_m2'] : null;
    grade = typeof f['site_area_m2_grade'] === 'string' ? f['site_area_m2_grade'] : null;
  } catch { /* an unreadable record is shown as held, without a figure */ }
  return {
    property_id: p.id, property: p.label, state: 'STORED',
    words: area === null
      ? 'We hold a site area from HM Land Registry\'s land boundary, but it could not be read back.'
      : `Site area ${area} square metres, from HM Land Registry's land boundary, marked confidence ${grade ?? 'not stated'}. ` +
        'For our own checks only: the boundary itself is not kept and never goes in a report.',
    site_area_m2: area, grade, at: r.obtained_at,
  };
}

/** PHASE 156f (B4): the area from Homedata's title outline for this property, as a line, or null. */
function heldFromTitleOutline(db: Db, business_id: string, p: PropertyRow): SiteAreaLine | null {
  const r = db.get<{ fields_json: string; obtained_at: string }>(
    'SELECT fields_json, obtained_at FROM register_records WHERE business_id = ? AND source_id = ? AND property_id = ? ' +
      'ORDER BY obtained_at DESC, id DESC LIMIT 1',
    [business_id, TITLE_BOUNDARY_SOURCE_ID, p.id],
  );
  if (r === undefined) return null;
  let area: number | null = null; let grade: string | null = null;
  try {
    const f = JSON.parse(r.fields_json) as Record<string, unknown>;
    area = typeof f['site_area_m2'] === 'number' ? f['site_area_m2'] : null;
    grade = typeof f['site_area_m2_grade'] === 'string' ? f['site_area_m2_grade'] : null;
  } catch { /* shown as held, without a figure */ }
  return {
    property_id: p.id, property: p.label, state: 'STORED',
    words: area === null
      ? `We hold a site area ${TITLE_BOUNDARY_LABEL}, but it could not be read back.`
      : `Site area ${area} square metres, ${TITLE_BOUNDARY_LABEL}, marked confidence ${grade ?? 'not stated'}. ` +
        'For our own checks only: the outline itself is not kept and never goes in a report.',
    site_area_m2: area, grade, at: r.obtained_at,
  };
}

/**
 * THE PANEL'S LINES, one per property. A site area held comes first; then what the last click found, unless a person
 * has entered a point or a council since, which the next click will use; then what the next click would do.
 */
export function siteAreaLines(db: Db, business_id: string, gates: SiteAreaGates, setup: SiteAreaSetup = {}): SiteAreaLine[] {
  return properties(db, business_id).map((p) => {
    const kept = held(db, business_id, p);
    if (kept !== null) return kept;
    const last = db.get<{ state: string; why: string; run_at: string }>(
      'SELECT state, why, run_at FROM site_area_runs WHERE property_id = ? ORDER BY run_at DESC, rowid DESC LIMIT 1', [p.id]);
    const since = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM site_area_inputs WHERE property_id = ? AND entered_at > ?', [p.id, last?.run_at ?? '']);
    if (last !== undefined && (since?.n ?? 0) === 0) {
      return { property_id: p.id, property: p.label, state: last.state as SiteAreaLineState, words: last.why, site_area_m2: null, grade: null, at: last.run_at };
    }
    return preview(db, business_id, p, gates, setup);
  });
}

/** A line the click actually got an answer for, and so is kept. */
export type SiteAreaRunLine = SiteAreaLine & { readonly kept: boolean };

/**
 * THE CLICK. For each property: the switch and the gates first, then the function, which does every other check and
 * the download. NEVER THROWS: a failure the function did not already turn into a state is "not found", with a reason.
 * The calls happen here, outside any transaction; the caller keeps the lines with `storeSiteAreaRuns`.
 */
export async function runSiteAreas(
  d: { readonly db: Db; readonly audit: AuditLog; readonly now: () => string; readonly newId: () => string },
  actor: Actor, business_id: string, gates: SiteAreaGates, outside: SiteAreaOutside | undefined, setup: SiteAreaSetup = {},
): Promise<SiteAreaRunLine[]> {
  const out: SiteAreaRunLine[] = [];
  for (const p of properties(d.db, business_id)) {
    const before = preview(d.db, business_id, p, gates, setup);
    if (before.state !== 'READY') { out.push({ ...before, kept: false }); continue; }
    if (outside === undefined) {
      out.push({ ...before, words: 'Allowed, but nothing could be contacted from here, so nothing was read or sent. The site area stays asked.', kept: false });
      continue;
    }
    const prep = prepare(d.db, business_id, p, setup);
    let o: SiteAreaOutcome;
    try {
      o = await siteAreaFromLandBoundary(
        {
          db: d.db, newId: d.newId, now: d.now,
          call: {
            audit: d.audit, now: d.now, transport: outside.transport,
            ...(outside.limiter === undefined ? {} : { limiter: outside.limiter }),
            ...(outside.sleep === undefined ? {} : { sleep: outside.sleep }),
          },
          grid: gridFor(prep.input.point, setup), file_store: storeFor(setup),
        },
        { ...prep.input, actor_id: actor.id, actor_role: actor.role, claim_id: null, gate: { free_gate_open: gates.free_gate_open, engagement_signed: gates.engagement_signed } },
      );
    } catch {
      o = { state: 'NOT_FOUND', why: 'The land boundary could not be read. The site area stays asked.', site_area_m2: null, grade: null, councils_read: [], record_id: null };
    }
    const at = d.now();
    out.push({ ...lineOf(p, o, prep, at), kept: o.state === 'STORED' || o.state === 'ALREADY_HELD' || o.state === 'NOT_FOUND' });
  }
  return out;
}

/** KEEP WHAT THE CLICK FOUND — inside the caller's transaction. Only a line where the land boundary was asked. */
export function storeSiteAreaRuns(
  d: { readonly db: Db; readonly newId: () => string }, actor: Actor, business_id: string, lines: readonly SiteAreaRunLine[], at: string,
): void {
  for (const l of lines) {
    if (!l.kept) continue;
    d.db.run(
      'INSERT INTO site_area_runs (id, business_id, property_id, state, why, run_at, run_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [d.newId(), business_id, l.property_id, l.state, l.words, at, actor.id],
    );
  }
}
