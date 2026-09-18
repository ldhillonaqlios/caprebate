/**
 * Caprebate — Postcode to Billing Authority Resolver (prepared, NOT SHIPPED)
 *
 * Board item 12991298199, "Resolve a property's postcode to its billing
 * authority from the ONS postcode lookup". Phase 9. Built 8 September 2026.
 *
 * WHY THIS EXISTS. LEG-E4 — the regional location factor — consumes a
 * `location_key` and refuses without one. Nothing in this system has ever
 * produced one. That, not the price-book purchase, is the reason LEG-E4 could
 * not ship: buying the book would have bought a table nobody could key into.
 * This module is the missing half.
 *
 * ABSOLUTE RULE, enforced in code and not only in prose: this module never
 * makes a network call. `onsFetchNotWired` — the default, always-on fetcher —
 * throws before doing anything else. Every other function here is a pure
 * parser or a pure lookup over caller-supplied text.
 *
 * AND THE REASON IS NOT A LICENCE. This is the difference between this module
 * and `caprebate-voa-import.ts`, which refuses for a reason that will one day
 * be negotiated away. Here THE LICENCE IS ALREADY CLEARED — see ONS_LICENCE
 * below. The refusal is architectural: the engine makes zero network calls,
 * ingest is a build-time job, and a runtime lookup reads an ingested table.
 * Do not "fix" this by wiring a fetch.
 *
 * THE TABLE SHIPS EMPTY, exactly as every other Phase 9 table does. The
 * mechanism ships; the data does not. Nothing here can return an answer until
 * somebody runs an ingest and hands the result in.
 *
 * Runs on Node >= 22.6 with type stripping (`node --test file.ts`). No enums,
 * no namespaces, no parameter properties — those are not strippable.
 *
 * Run:  cd phase9 && node --test caprebate-postcode-authority.test.ts
 */

/* ------------------------------------------------------------------ *
 * 1. The licence, and the one carve-out that costs money
 * ------------------------------------------------------------------ */

/**
 * Established 7 September 2026 by fetching the publisher's own pages and
 * querying its own live service — not assumed, and not inherited from an
 * earlier note. The item had been recorded as blocked on the VOA rating list,
 * which IS licence-gated. This route is not.
 */
export const ONS_LICENCE = {
  publisher: 'Office for National Statistics',
  portal: 'ONS Open Geography Portal',
  product: 'National Statistics Postcode Lookup',
  licence: 'Open Government Licence v3.0',
  negotiation_required: false,
  fee: null,
  /**
   * ONS requires all THREE of these, not the generic OGL line. Reusing the
   * generic "Contains public sector information..." wording under-attributes
   * and is a licence breach, which is why this source does not share the
   * OGL_V3 licence entry with Companies House and planning data.
   * `[year]` is substituted at render time from `release_year`.
   */
  attribution_lines: [
    'Contains OS data © Crown copyright and database right [year]',
    'Contains Royal Mail data © Royal Mail copyright and database right [year]',
    'Source: Office for National Statistics licensed under the Open Government Licence v.3.0',
  ],
  /**
   * THE ONE CARVE-OUT, AND IT IS A REAL ONE. Northern Ireland postcodes are
   * excluded from the OGL grant for commercial use; they need a separate
   * licence direct from Land and Property Services. ONS supplies only a
   * Northern Ireland End User Licence for internal business use.
   *
   * NOTE WHAT THIS DOES AND DOES NOT COST US. We serve England and Wales, so
   * it does not bite today. It also would not bite if we ever widened to
   * SCOTLAND — Scottish postcodes are inside the OGL grant. It bites only on
   * Northern Ireland, and there it costs money. Widening the jurisdiction is
   * therefore not one decision but two, and only one of them is free.
   */
  excluded_territory: {
    territory: 'Northern Ireland',
    postcode_area: 'BT',
    reason: 'commercial use needs a separate licence from Land and Property Services',
    licensor: 'Land and Property Services',
  },
  /** Quarterly: February, May, August, November. */
  release_cadence_months: 3,
  verified_on: '2026-09-07',
} as const;

/* ------------------------------------------------------------------ *
 * 2. Errors
 * ------------------------------------------------------------------ */

export type PostcodeAuthorityErrorCode =
  | 'E_POSTCODE_REQUIRED'
  | 'E_POSTCODE_MALFORMED'
  | 'E_POSTCODE_NORTHERN_IRELAND'
  | 'E_TABLE_NOT_LOADED'
  | 'E_POSTCODE_NOT_IN_TABLE'
  | 'E_POSTCODE_TERMINATED'
  | 'E_LOCATION_KEY_TABLE_NOT_LOADED'
  | 'E_LAD_NOT_IN_LOCATION_KEY_TABLE'
  | 'E_NO_NETWORK_CALL_IN_ENGINE'
  | 'E_MISSING_HEADER'
  | 'E_UNKNOWN_COLUMN'
  | 'E_EMPTY_FILE';

export class PostcodeAuthorityError extends Error {
  code: PostcodeAuthorityErrorCode;
  detail: Record<string, unknown>;
  constructor(
    code: PostcodeAuthorityErrorCode,
    message: string,
    detail: Record<string, unknown> = {},
  ) {
    super(`[${code}] ${message}`);
    this.name = 'PostcodeAuthorityError';
    this.code = code;
    this.detail = detail;
  }
}

const fail = (
  code: PostcodeAuthorityErrorCode,
  message: string,
  detail: Record<string, unknown> = {},
): never => {
  throw new PostcodeAuthorityError(code, message, detail);
};

/* ------------------------------------------------------------------ *
 * 3. Postcode normalisation
 *
 * THE DIVISION OF LABOUR HERE IS DELIBERATE: THE PATTERN DECIDES SHAPE,
 * THE TABLE DECIDES EXISTENCE.
 *
 * It is tempting to validate UK postcodes exhaustively — the real rules
 * exclude certain letters in certain positions and enumerate a handful of
 * special cases. Resist it. A regex that rejects a postcode the ONS table
 * actually contains is a client who cannot be served, and it fails silently
 * as "malformed" rather than "we have a bug". A regex that admits a postcode
 * the table does not contain costs nothing: the lookup refuses a line later,
 * with a better message.
 *
 * So this pattern is structural and permissive on purpose, and the ingested
 * table is the authority on whether a postcode exists.
 * ------------------------------------------------------------------ */

/**
 * outward = 1–2 letters, a digit, then optionally a digit or a letter
 * inward  = a digit then two letters
 * Covers AA9A 9AA, A9A 9AA, A9 9AA, A99 9AA, AA9 9AA, AA99 9AA.
 */
const POSTCODE_PATTERN = /^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/;

/**
 * THREE-LETTER OUTWARD CODES. The general pattern above requires a digit after
 * the one or two leading letters, and these do not have one — so without this
 * list they are reported as malformed, which is wrong and is exactly the
 * failure this module's own rule warns about.
 *
 * FOUND BY RUNNING THE REAL FILE, 8 September 2026. Ingesting NSPL_AUG_2026
 * quarantined 2,418 postcodes as malformed. 2,417 of them were NPT — the
 * historic Newport, Gwent area, superseded by NP but still carried in the ONS
 * table. They are all terminated, so nothing would have resolved them anyway;
 * what would have been wrong is the REASON. A client whose historic address is
 * an NPT postcode should be told it was terminated, not that they have typed
 * something that is not a UK postcode.
 *
 * GIR 0AA (Girobank) is the other, and it is live.
 *
 * This is an allow-list rather than a looser pattern on purpose: relaxing the
 * general rule to admit any three letters would admit real garbage too.
 */
const POSTCODE_SPECIAL_OUTWARD: readonly string[] = ['GIR', 'NPT'];
const SPECIAL_OUTWARD_PATTERN = /^(GIR|NPT)[0-9][A-Z]{2}$/;

/**
 * Returns the canonical form: uppercase, exactly one space before the final
 * three characters. Throws rather than returning null — a postcode we cannot
 * read is a question, not an empty answer.
 */
export function normalisePostcode(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim() === '') {
    fail('E_POSTCODE_REQUIRED', 'a postcode is required', { given: raw });
  }
  const compact = (raw as string).toUpperCase().replace(/[\s -]/g, '');
  if (compact.length < 5 || compact.length > 7) {
    fail('E_POSTCODE_MALFORMED', `'${raw}' is not the length of a UK postcode`, {
      given: raw,
      compact,
    });
  }
  if (!POSTCODE_PATTERN.test(compact) && !SPECIAL_OUTWARD_PATTERN.test(compact)) {
    fail('E_POSTCODE_MALFORMED', `'${raw}' is not the shape of a UK postcode`, {
      given: raw,
      compact,
    });
  }
  return `${compact.slice(0, compact.length - 3)} ${compact.slice(-3)}`;
}

/** The letters before the first digit — 'CF10 3NB' -> 'CF', 'NPT 0AD' -> 'NPT'. */
export function postcodeArea(canonical: string): string {
  const compact = canonical.replace(/\s/g, '');
  for (const o of POSTCODE_SPECIAL_OUTWARD) if (compact.startsWith(o)) return o;
  const m = /^[A-Z]{1,2}/.exec(compact);
  return m ? m[0] : '';
}

/* ------------------------------------------------------------------ *
 * 4. The tables — both empty, for two DIFFERENT reasons
 * ------------------------------------------------------------------ */

export type PostcodeAuthorityRow = {
  readonly lad_code: string;
  readonly lad_name: string;
  readonly country_code: string;
  /**
   * NSPL's region code — the nine English regions, and a pseudo-code for
   * Wales, Scotland and Northern Ireland. OPTIONAL, and it is optional for
   * the same reason `country` is: not every NSPL vintage or per-area extract
   * carries the column, and a resolver that refused without it would fail on
   * files that answer the question it was actually asked. Absent means the
   * region is UNKNOWN, never a default region — see caprebate-region.ts,
   * which is the only thing that reads it.
   *
   * ADDED BY PHASE 110. Before it, a surveyor's rate library was keyed on the
   * constant REGION_NOT_CAPTURED across the whole country.
   */
  readonly region_code?: string | null;
  /** NSPL's date-of-termination. Null for a live postcode. */
  readonly terminated_on: string | null;
};

export type PostcodeAuthorityTable = {
  table_id: string;
  source: string;
  licence: string;
  loaded: boolean;
  verified_at: string | null;
  /** e.g. 'AUG_2026'. Null while empty. */
  release: string | null;
  /** The year that substitutes into ONS_LICENCE.attribution_lines. */
  release_year: number | null;
  record_count: number;
  /** Which header the local-authority code was actually read from. ONS renames
   *  it every release, so the table records what it was built from. */
  lad_column_used?: string;
  /** Which header the region code was read from, or null if the file had
   *  none. Phase 110. Recorded for the same reason as lad_column_used, and
   *  null is a normal answer rather than a defect. */
  region_column_used?: string | null;
  byPostcode: Record<string, PostcodeAuthorityRow>;
};

/**
 * EMPTY BECAUSE NOBODY HAS RUN AN INGEST YET — not because anything forbids
 * it. This is the only empty table in Phase 9 whose licence is already
 * cleared, and it is the cheapest of them all to fill: one 176.5 MB download,
 * no counterparty, no fee.
 */
export const CB_ONS_POSTCODE_AUTHORITY: PostcodeAuthorityTable = {
  table_id: 'CB_ONS_POSTCODE_AUTHORITY',
  source: 'ONS National Statistics Postcode Lookup (Open Geography Portal)',
  licence: 'CLEARED - Open Government Licence v3.0, attribution required, Northern Ireland excluded',
  loaded: false,
  verified_at: null,
  release: null,
  release_year: null,
  record_count: 0,
  byPostcode: {},
};

export type LocationKeyTable = {
  table_id: string;
  source: string;
  licence: string;
  loaded: boolean;
  verified_at: string | null;
  byLadCode: Record<string, string>;
};

/**
 * THE SECOND TABLE, AND THE HONEST LIMIT OF THIS MODULE.
 *
 * The resolver above returns a GSS code — 'W06000015' for Cardiff. The price
 * book does not key its location factors on GSS codes; it keys them on its own
 * regional naming, WHICH WE CANNOT SEE UNTIL THE BOOK IS BOUGHT. So there is a
 * translation step between this module and LEG-E4, and it is empty for a
 * completely different reason from the table above: that one waits on an
 * ingest anybody could run this afternoon, this one waits on a GBP 330
 * purchase (board item 12804374406).
 *
 * SAYING SO IS THE POINT. Resolving the postcode removes ONE of the two things
 * standing in the way of LEG-E4. It does not turn it on, and a reader who
 * assumed otherwise would be wrong by a purchase order.
 */
export const CB_LAD_TO_LOCATION_KEY: LocationKeyTable = {
  table_id: 'CB_LAD_TO_LOCATION_KEY',
  source: "Spon's / BCIS regional location factor keys",
  licence: 'NOT PURCHASED - board item 12804374406 (approx GBP 330)',
  loaded: false,
  verified_at: null,
  byLadCode: {},
};

/**
 * WHERE THE ROWS COME FROM, AS A SHAPE RATHER THAN AS A FILE.
 *
 * ADDED BY PHASE 110. The whole UK table is 2.66 million rows and holding it
 * in a JavaScript object costs about 310 MB of heap and 630 MB of resident
 * memory per process — measured, not assumed; see
 * caprebate-postcode-store-costing.cjs. That is a deployment decision, and a
 * deployment decision has no business being hard-coded in a resolver.
 *
 * SO THE RESOLVER TAKES A SOURCE AND NOT A TABLE. `caprebate-postcode-store.ts`
 * supplies two — the object it always had, and a read-only SQLite file at
 * 75 MB on disk and about 11 MB resident — and its `PostcodeStore` is
 * assignable to this. THE TYPE IS DECLARED HERE RATHER THAN IMPORTED so this
 * module depends on nothing: the resolver is the thing every other decision
 * is built on and it must not acquire an import to get a storage choice.
 */
export type PostcodeSource = {
  readonly loaded: boolean;
  readonly licence: string;
  readonly release: string | null;
  readonly release_year: number | null;
  readonly verified_at: string | null;
  /** For the not-loaded refusal's detail. Defaults to the table id. */
  readonly store_id?: string;
  get(canonicalPostcode: string): PostcodeAuthorityRow | undefined;
};

export type ResolverTables = {
  CB_ONS_POSTCODE_AUTHORITY?: PostcodeAuthorityTable;
  CB_LAD_TO_LOCATION_KEY?: LocationKeyTable;
};

export type ResolverOptions = {
  tables?: ResolverTables;
  /**
   * The postcode rows. TAKES PRECEDENCE OVER `tables` when both are given —
   * a caller who has opened a store meant to use it, and silently preferring
   * the empty module-level table would refuse every real postcode while
   * looking like a data problem.
   */
  store?: PostcodeSource;
  /**
   * Accept a postcode NSPL has terminated. Default false: a terminated
   * postcode usually means a redeveloped or re-addressed property, which is
   * exactly the kind of thing a surveyor should be told about rather than have
   * silently resolved.
   */
  allowTerminated?: boolean;
};

/** A plain table, seen through the source port. No copy, no second lookup. */
export function sourceFromTable(table: PostcodeAuthorityTable): PostcodeSource {
  return {
    loaded: table.loaded,
    licence: table.licence,
    release: table.release,
    release_year: table.release_year,
    verified_at: table.verified_at,
    store_id: table.table_id,
    get: (pc) => table.byPostcode[pc],
  };
}

function postcodeSource(opts: ResolverOptions | undefined): PostcodeSource {
  const s: PostcodeSource = (opts && opts.store) ||
    sourceFromTable(
      (opts && opts.tables && opts.tables.CB_ONS_POSTCODE_AUTHORITY) ||
        CB_ONS_POSTCODE_AUTHORITY,
    );
  if (!s.loaded) {
    fail(
      'E_TABLE_NOT_LOADED',
      'the ONS postcode table has not been ingested. The licence is cleared and ' +
        'the download is free — this is an ingest that has not been run, not a ' +
        'permission that has not been granted. See caprebate-postcode-authority.md.',
      { table_id: s.store_id ?? CB_ONS_POSTCODE_AUTHORITY.table_id, licence: s.licence },
    );
  }
  return s;
}

/* ------------------------------------------------------------------ *
 * 5. The resolver
 * ------------------------------------------------------------------ */

export type BillingAuthority = {
  readonly postcode: string;
  readonly lad_code: string;
  readonly lad_name: string;
  readonly country_code: string;
  /** NSPL's region code, or null where the source did not carry one. */
  readonly region_code: string | null;
  readonly terminated_on: string | null;
  readonly source_id: string;
  readonly release: string | null;
  /** The three ONS lines, with [year] substituted. Carry these to any output. */
  readonly attribution: readonly string[];
  readonly flags: readonly string[];
};

export function attributionFor(
  table: Pick<PostcodeAuthorityTable, 'release_year'>,
): readonly string[] {
  const year = table.release_year === null ? '[year]' : String(table.release_year);
  return ONS_LICENCE.attribution_lines.map((l) => l.replace('[year]', year));
}

/**
 * Postcode -> billing authority. Refuses rather than guessing, at every step.
 *
 * A billing authority is the local authority district for non-domestic rates,
 * which at England-and-Wales level is exactly the LAD in this dataset.
 */
export function resolveBillingAuthority(
  rawPostcode: unknown,
  opts?: ResolverOptions,
): BillingAuthority {
  const postcode = normalisePostcode(rawPostcode);

  /* THE LICENCE REFUSAL COMES BEFORE THE LOOKUP, ON PURPOSE. It is not a
     jurisdiction check — the engine has CB_JURIS for that, and the two can
     disagree without either being wrong. This one says: even if we served
     Northern Ireland tomorrow, this dataset may not be used commercially
     there without a separate licence somebody has to buy. */
  if (postcodeArea(postcode) === ONS_LICENCE.excluded_territory.postcode_area) {
    fail(
      'E_POSTCODE_NORTHERN_IRELAND',
      `'${postcode}' is a Northern Ireland postcode. The ONS lookup is licensed to ` +
        'us under the Open Government Licence for Great Britain only; Northern ' +
        'Ireland needs a separate commercial licence from Land and Property ' +
        'Services. Refusing rather than resolving it.',
      { postcode, licensor: ONS_LICENCE.excluded_territory.licensor },
    );
  }

  const table = postcodeSource(opts);
  const row = table.get(postcode);
  if (row === undefined) {
    fail(
      'E_POSTCODE_NOT_IN_TABLE',
      `no billing authority for '${postcode}'. Refusing to fall back to a nearby ` +
        'or default authority — an unlisted postcode is a question, not a guess.',
      { postcode, release: table.release },
    );
  }

  const flags: string[] = [];
  if (row.terminated_on !== null) {
    if (!(opts && opts.allowTerminated)) {
      fail(
        'E_POSTCODE_TERMINATED',
        `'${postcode}' was terminated on ${row.terminated_on}. A terminated postcode ` +
          'usually means the property was redeveloped or re-addressed, which is a ' +
          'fact a surveyor needs rather than one to resolve past. Pass ' +
          'allowTerminated to accept it deliberately.',
        { postcode, terminated_on: row.terminated_on },
      );
    }
    flags.push('POSTCODE_TERMINATED_ACCEPTED');
  }

  return {
    postcode,
    lad_code: row.lad_code,
    lad_name: row.lad_name,
    country_code: row.country_code,
    region_code: row.region_code ?? null,
    terminated_on: row.terminated_on,
    source_id: 'ONS_POSTCODE',
    release: table.release,
    attribution: attributionFor(table),
    flags,
  };
}

/**
 * The full chain LEG-E4 actually needs: postcode -> LAD -> the price book's
 * own regional key. Refuses at whichever link is missing, and the two links
 * fail with DIFFERENT codes because they are blocked on different things.
 */
export function resolveLocationKey(
  rawPostcode: unknown,
  opts?: ResolverOptions,
): { location_key: string; authority: BillingAuthority } {
  const authority = resolveBillingAuthority(rawPostcode, opts);
  const t = (opts && opts.tables && opts.tables.CB_LAD_TO_LOCATION_KEY) ||
    CB_LAD_TO_LOCATION_KEY;
  if (!t.loaded) {
    fail(
      'E_LOCATION_KEY_TABLE_NOT_LOADED',
      `resolved '${authority.postcode}' to ${authority.lad_name} (${authority.lad_code}), ` +
        'but the map from local authority to the price book\'s own regional key is ' +
        'empty because the price book has not been bought. The postcode half of ' +
        'LEG-E4 is solved; the purchase half is not.',
      { table_id: t.table_id, licence: t.licence, lad_code: authority.lad_code },
    );
  }
  const key = t.byLadCode[authority.lad_code];
  if (key === undefined) {
    fail(
      'E_LAD_NOT_IN_LOCATION_KEY_TABLE',
      `${authority.lad_name} (${authority.lad_code}) has no entry in the price book's ` +
        'regional key map. Refusing to fall back to a national mean.',
      { lad_code: authority.lad_code, lad_name: authority.lad_name },
    );
  }
  return { location_key: key, authority };
}

/* ------------------------------------------------------------------ *
 * 6. Ingest — a pure parser over caller-supplied text
 * ------------------------------------------------------------------ */

export type NsplQuarantineCode =
  | 'E_BAD_COLUMN_COUNT'
  | 'E_MISSING_POSTCODE'
  | 'E_MALFORMED_POSTCODE'
  | 'E_MISSING_LAD_CODE'
  | 'E_NORTHERN_IRELAND_ROW'
  | 'E_DUPLICATE_POSTCODE';

export type NsplQuarantineRow = {
  readonly line_number: number;
  readonly raw_line: string;
  readonly code: NsplQuarantineCode;
  readonly reason: string;
};

/**
 * ASSUMPTION A-1 — CHECKED ON 8 SEPTEMBER 2026, AND IT WAS WRONG.
 *
 * This module first shipped assuming `pcds`, `doterm` and `laua`, the
 * documented historic layout, with a note saying nobody had opened the CSV.
 * Somebody then opened it: NSPL_AUG_2026.zip was downloaded and its real
 * header read. Two of the three names were right and one was not.
 *
 *   pcds    correct
 *   doterm  correct
 *   laua    WRONG. The real column is `lad26cd`.
 *
 * AND THE INTERESTING PART IS NOT THAT IT WAS WRONG, IT IS THAT IT MOVES.
 * The local-authority column is VERSIONED BY RELEASE YEAR — `lad26cd` in the
 * August 2026 CSV, `LAD25CD` on the live feature service, `laua` historically.
 * A hard-coded name is therefore not merely wrong today, it is a thing that
 * breaks every time ONS publishes. Since ONS publishes quarterly and this
 * table is refreshed quarterly, a hard-coded name would fail on roughly the
 * fourth refresh and look like a corrupt download.
 *
 * So the default is the VERIFIED name, and `resolveColumn` below falls back to
 * the versioned pattern and RECORDS which column it actually used, rather than
 * either failing or silently guessing.
 */
export const NSPL_COLUMNS_VERIFIED = {
  postcode: 'pcds',
  terminated: 'doterm',
  lad_code: 'lad26cd',
  country: 'ctry26cd',
  /**
   * THE REGION COLUMN, ADDED BY PHASE 110 AND NOT VERIFIED AGAINST A REAL
   * FILE — which is why it is treated as optional everywhere below and why
   * this comment says so rather than the name implying otherwise.
   *
   * `rgn` is the historic name and it is versioned the same way the local
   * authority column is, so it gets the same pattern fallback and the ingest
   * records which header it actually used. IF IT IS ABSENT THE INGEST DOES
   * NOT FAIL: every row's region_code is null, the resolver still answers,
   * and only the region lookup refuses — with a message naming this column.
   * A resolver that stopped working because an OPTIONAL column moved would
   * be a worse outcome than the thing it was added for.
   */
  region: 'rgn',
} as const;

/** Kept as the old name so nothing referring to it breaks; it is no longer an
 *  assumption, it is a verified reading. */
export const NSPL_COLUMNS_ASSUMED = NSPL_COLUMNS_VERIFIED;

export type NsplColumns = {
  postcode: string;
  terminated: string;
  lad_code: string;
  country?: string;
  region?: string;
};

/** `lad26cd`, `lad25cd`, `laua` — the same column across ONS release vintages. */
const LAD_COLUMN_PATTERN = /^(lad\d*cd|laua)$/;
/** `ctry26cd`, `ctry25cd`, `ctry`. */
const COUNTRY_COLUMN_PATTERN = /^ctry\d*cd?$/;
/** `rgn`, `rgn24cd`, and the older Government Office Region name `gor`. */
const REGION_COLUMN_PATTERN = /^(rgn\d*cd?|gor)$/;

export type NsplIngestResult = {
  table: PostcodeAuthorityTable;
  quarantined: readonly NsplQuarantineRow[];
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else { cur += ch; }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Builds the lookup table from NSPL CSV text plus a name lookup for the local
 * authority codes (NSPL carries codes, not names — the names come from the
 * portal's own LAD names-and-codes file).
 *
 * A bad ROW is quarantined with a reason, never thrown and never silently
 * dropped. A bad FILE throws. Same discipline as the VOA connector.
 */
export type NsplIngest = {
  /** Feed the header line first. Returns which column it resolved for the LAD. */
  header: (line: string) => string;
  /** Feed one data line. Returns true if it was kept, false if quarantined. */
  row: (line: string, lineNumber: number) => boolean;
  finish: () => NsplIngestResult;
};

/**
 * THE INCREMENTAL INGESTER, AND THE REASON IT EXISTS IS NOT ELEGANCE.
 *
 * This module first exposed only `ingestNspl(csvText: string)`. That API
 * cannot read the file it was written for. The real NSPL UK extract is
 * 964 MB of CSV, and Node's maximum string length is about 512 MB, so
 * `readFileSync(path, 'utf8')` throws ERR_STRING_TOO_LONG before a single row
 * is parsed. Found on 8 September 2026 by running the ingest against the real
 * download — every unit test passed, because every fixture was three lines.
 *
 * So the row logic lives here and is fed a line at a time, and `ingestNspl`
 * below is a thin wrapper for small inputs and tests. A caller with the real
 * file streams it; a caller with a fixture does not have to care.
 */
export function createNsplIngest(
  ladNames: Record<string, string>,
  meta: { release: string; release_year: number; verified_at: string },
  columns: NsplColumns = NSPL_COLUMNS_VERIFIED,
): NsplIngest {
  const idx: Record<string, number> = {};
  let countryAt = -1;
  let regionAt = -1;
  let ladColumnUsed = columns.lad_code;
  let regionColumnUsed: string | null = null;
  let headerSeen = false;

  const byPostcode: Record<string, PostcodeAuthorityRow> = {};
  const quarantined: NsplQuarantineRow[] = [];
  const q = (n: number, raw: string, code: NsplQuarantineCode, reason: string) => {
    quarantined.push({ line_number: n, raw_line: raw, code, reason });
  };
  let headerWidth = 0;

  const header = (line: string): string => {
    /* The ONS files carry a UTF-8 byte-order mark. Left in place it makes the
       first column name unmatchable while looking identical in any error
       message printed alongside it, which is the worst kind of bug to read. */
    const cells = splitCsvLine(line.replace(/^\uFEFF/, '')).map((h) => h.toLowerCase());
    headerWidth = cells.length;

    for (const key of ['postcode', 'terminated', 'lad_code'] as const) {
      const name = columns[key].toLowerCase();
      let at = cells.indexOf(name);

      /* THE LOCAL-AUTHORITY COLUMN IS VERSIONED AND MOVES EVERY RELEASE — see
         NSPL_COLUMNS_VERIFIED. Fall back to the pattern rather than failing a
         quarterly refresh, but RECORD which column was actually used so the
         table says what it was built from instead of implying the default. */
      if (at < 0 && key === 'lad_code') {
        at = cells.findIndex((h) => LAD_COLUMN_PATTERN.test(h));
        if (at > -1) ladColumnUsed = cells[at];
      }

      if (at < 0) {
        fail(
          'E_UNKNOWN_COLUMN',
          `the NSPL extract has no column '${columns[key]}'` +
            (key === 'lad_code'
              ? ', and nothing matching the versioned local-authority pattern ' +
                '(lad<year>cd or laua) either. ONS renames this column each ' +
                'release; read the real header and pass `columns`.'
              : '. Read the real header and pass `columns`.'),
          { wanted: columns[key], header: cells },
        );
      }
      idx[key] = at;
    }

    /* Country is OPTIONAL. Where ONS gives it we use it; where it is absent the
       first letter of the GSS code carries the same fact (E/W/S/N). */
    countryAt = columns.country ? cells.indexOf(columns.country.toLowerCase()) : -1;
    if (countryAt < 0) countryAt = cells.findIndex((h) => COUNTRY_COLUMN_PATTERN.test(h));

    /* Region is OPTIONAL in exactly the sense country is, and for a stronger
       reason: the default name has never been read off a real file. Absent,
       every region_code is null and the region lookup — and only the region
       lookup — refuses. */
    regionAt = columns.region ? cells.indexOf(columns.region.toLowerCase()) : -1;
    if (regionAt < 0) regionAt = cells.findIndex((h) => REGION_COLUMN_PATTERN.test(h));
    regionColumnUsed = regionAt > -1 ? cells[regionAt] : null;

    headerSeen = true;
    return ladColumnUsed;
  };

  const row = (raw: string, lineNumber: number): boolean => {
    if (!headerSeen) fail('E_MISSING_HEADER', 'header() must be called before row()', {});
    const cells = splitCsvLine(raw);
    if (cells.length < headerWidth) {
      q(lineNumber, raw, 'E_BAD_COLUMN_COUNT',
        `expected ${headerWidth} columns, found ${cells.length}`);
      return false;
    }
    const rawPc = cells[idx.postcode];
    if (!rawPc) { q(lineNumber, raw, 'E_MISSING_POSTCODE', 'no postcode'); return false; }

    let pc: string;
    try {
      pc = normalisePostcode(rawPc);
    } catch {
      q(lineNumber, raw, 'E_MALFORMED_POSTCODE', `'${rawPc}' is not a UK postcode`);
      return false;
    }

    /* Northern Ireland rows are dropped AT INGEST, not at lookup. Keeping them
       in the table and refusing later would mean holding data we are not
       licensed to use commercially, which is the thing the carve-out forbids.
       Refusing at lookup as well is belt and braces, not the control. */
    if (postcodeArea(pc) === ONS_LICENCE.excluded_territory.postcode_area) {
      q(lineNumber, raw, 'E_NORTHERN_IRELAND_ROW',
        'Northern Ireland is outside our Open Government Licence grant');
      return false;
    }

    const lad = cells[idx.lad_code];
    if (!lad) { q(lineNumber, raw, 'E_MISSING_LAD_CODE', `no local authority code for ${pc}`); return false; }
    if (byPostcode[pc] !== undefined) {
      q(lineNumber, raw, 'E_DUPLICATE_POSTCODE', `${pc} already seen`);
      return false;
    }

    const term = cells[idx.terminated];
    const ctry = countryAt > -1 ? (cells[countryAt] || '').trim() : '';
    const rgn = regionAt > -1 ? (cells[regionAt] || '').trim() : '';
    byPostcode[pc] = {
      lad_code: lad,
      lad_name: ladNames[lad] || lad,
      country_code: ctry !== '' ? ctry : lad.slice(0, 1),
      region_code: rgn !== '' ? rgn : null,
      terminated_on: term && term.trim() !== '' ? term.trim() : null,
    };
    return true;
  };

  const finish = (): NsplIngestResult => ({
    table: {
      table_id: CB_ONS_POSTCODE_AUTHORITY.table_id,
      source: CB_ONS_POSTCODE_AUTHORITY.source,
      licence: CB_ONS_POSTCODE_AUTHORITY.licence,
      loaded: true,
      verified_at: meta.verified_at,
      release: meta.release,
      release_year: meta.release_year,
      record_count: Object.keys(byPostcode).length,
      lad_column_used: ladColumnUsed,
      region_column_used: regionColumnUsed,
      byPostcode,
    },
    quarantined,
  });

  return { header, row, finish };
}

/**
 * Whole-file convenience over `createNsplIngest`. Fine for fixtures, for one
 * of the per-area extracts, and for tests. NOT usable on the single 964 MB UK
 * file — see the note on createNsplIngest.
 */
export function ingestNspl(
  csvText: string,
  ladNames: Record<string, string>,
  meta: { release: string; release_year: number; verified_at: string },
  columns: NsplColumns = NSPL_COLUMNS_VERIFIED,
): NsplIngestResult {
  if (typeof csvText !== 'string' || csvText.trim() === '') {
    fail('E_EMPTY_FILE', 'the NSPL extract is empty', {});
  }
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) {
    fail('E_MISSING_HEADER', 'the NSPL extract has a header but no rows', {
      lines: lines.length,
    });
  }
  const ing = createNsplIngest(ladNames, meta, columns);
  ing.header(lines[0]);
  for (let i = 1; i < lines.length; i++) ing.row(lines[i], i + 1);
  return ing.finish();
}

/* ------------------------------------------------------------------ *
 * 7. The fetcher that always refuses
 * ------------------------------------------------------------------ */

export type OnsFetcher = (url: string) => Promise<string>;

/**
 * The default and only fetcher. Throws before doing anything.
 *
 * READ THE MESSAGE BEFORE YOU CHANGE THIS. The licence is cleared and the file
 * is free; that is not what this refusal is about. The engine makes zero
 * network calls, and the moment one module makes one, "the engine makes zero
 * network calls" stops being a fact anyone can rely on.
 */
export const onsFetchNotWired: OnsFetcher = async (url: string): Promise<string> => {
  throw new PostcodeAuthorityError(
    'E_NO_NETWORK_CALL_IN_ENGINE',
    `refused to fetch '${url}'. The ONS licence IS cleared and this file is free — ` +
      'that is not the reason. The engine makes no network calls at all: ingest is ' +
      'an out-of-band job whose output is handed to ingestNspl as text. No network ' +
      'call has been attempted.',
    { url },
  );
};

/** Staleness against the publisher's quarterly cycle, plus a month's grace. */
export const ONS_TABLE_MAX_AGE_DAYS = 120;

export function tableIsStale(table: PostcodeAuthorityTable, asAt: Date): boolean {
  if (!table.loaded || table.verified_at === null) return true;
  const age = (asAt.getTime() - new Date(table.verified_at).getTime()) / 86400000;
  return age > ONS_TABLE_MAX_AGE_DAYS;
}
