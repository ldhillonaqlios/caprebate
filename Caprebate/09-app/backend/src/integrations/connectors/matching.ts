/**
 * MATCHING A TYPED ADDRESS, OR A TYPED NAME, TO WHAT A REGISTER HOLDS. Phase 146c, 23 September 2026.
 *
 * Built from the S10 Address Matching Spec (08-monday-doc-exports/12819677135__S10-Address-Matching-Spec.md): its
 * normaliser, its Jaro-Winkler and token-set Dice scores, its weights, its two thresholds and its tie rule (Part A.2,
 * A.5 and the Part B code), and the energy certificate profile and address mapper of A.8. The spec's code was never in
 * the repository; this is it, with the one addition the free lookups need — the mapper that splits free address lines
 * into building number, sub-unit and street, so a typed address and a register's lines are split by one rule.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS (standing rule 13, "the one open question")
 *
 * Before an engagement there is no UPRN: the paid address lookup never runs before signature. So the free registers are
 * searched on the TYPED postcode and address, and every candidate they return is scored against it. Only an ACCEPT
 * pre-fills anything. REVIEW, REJECT, INSUFFICIENT_INPUT and MATCH_ERROR all end the same way for the client: the fact
 * stays ASKED. Nothing refuses, nothing throws, and no value stands in for the fact (N4).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE THRESHOLDS ARE NOT MEASURED, AND THIS FILE SAYS SO
 *
 * `MATCH_THRESHOLDS` holds the spec's provisional 0.90 / 0.70 for every register. The spec's 200-property test (A.4,
 * and A.8 point 10 for the energy certificate register) has not been run, so nobody knows whether 0.90 is good enough,
 * and this file does not assert that it is or that it is not. `THRESHOLDS_MEASURED` is false until it has run; the
 * harness that runs it is tools/match-measure.ts, and it waits on the data protection officer. Until then every
 * accepted match is written at grade B at most (A.6), never A.
 *
 * NO NAME IS SCORED. This file compares address strings and company names. A company name is the identity of a legal
 * entity, not a person (the name exclusion register, CH_COMPANY's note), and nothing here is stored: the caller keeps
 * only the accepted candidate's permitted fields, never the candidate list or a candidate's address lines (A.8 point 8).
 */

/* ================================================================== *
 * 1 · THE THRESHOLDS — ONE NAMED CONSTANT, PROVISIONAL
 * ================================================================== */

export type MatchStatus = 'ACCEPT' | 'REVIEW' | 'REJECT' | 'INSUFFICIENT_INPUT' | 'MATCH_ERROR';

export type Thresholds = { readonly accept: number; readonly review: number };

/** The registers a typed address or name is matched against, each with its own pair, because the spec expects them to calibrate apart. */
export type MatchProfile = 'CH_COMPANY' | 'CQC' | 'EPC' | 'HMLR_PPD' | 'PLANNING';

/**
 * THE SPEC'S PROVISIONAL PAIR, FOR EVERY REGISTER. Not calibrated. Replaced per register by the 200-property
 * measurement (tools/match-measure.ts), which may move a threshold UP and never down (A.4 point 5).
 */
export const MATCH_THRESHOLDS: Readonly<Record<MatchProfile, Thresholds>> = Object.freeze({
  CH_COMPANY: Object.freeze({ accept: 0.90, review: 0.70 }),
  CQC: Object.freeze({ accept: 0.90, review: 0.70 }),
  EPC: Object.freeze({ accept: 0.90, review: 0.70 }),
  HMLR_PPD: Object.freeze({ accept: 0.90, review: 0.70 }),
  PLANNING: Object.freeze({ accept: 0.90, review: 0.70 }),
});

/** False until the 200-property measurement has run and its thresholds are written above. */
export const THRESHOLDS_MEASURED = false;

/** The best grade an accepted match may write while the thresholds are unmeasured (spec A.6). */
export const UNMEASURED_MATCH_GRADE_CAP = 'B';

/* ================================================================== *
 * 2 · NORMALISING — spec A.2 step 1
 * ================================================================== */

export type RawAddress = {
  readonly paon?: string;
  readonly saon?: string;
  readonly street?: string;
  readonly locality?: string;
  readonly town?: string;
  readonly postcode?: string;
};

export type NormalizedAddress = {
  readonly paon: string;
  readonly saon: string;
  readonly street: string;
  readonly locality: string;
  readonly town: string;
  readonly postcode: string;
  /** Outward and inward, one space; '' when absent or not a postcode. */
  readonly postcodeKey: string;
};

const STREET_SUFFIX_EXPANSIONS: Readonly<Record<string, string>> = Object.freeze({
  RD: 'ROAD', AVE: 'AVENUE', LN: 'LANE', DR: 'DRIVE', CL: 'CLOSE',
  CT: 'COURT', PL: 'PLACE', HSE: 'HOUSE', GDNS: 'GARDENS', CRES: 'CRESCENT',
});

/** Saint names, so "ST" before one stays ST and is not read as STREET (spec A.2 step 1). A short list; the measurement says if it is short enough. */
const SAINT_NAMES = new Set(['ALBANS', 'ANDREWS', 'ANNES', 'DAVIDS', 'GEORGES', 'HELENS', 'IVES', 'JAMES', 'JOHNS', 'LEONARDS', 'MARYS', 'MICHAELS', 'NEOTS', 'PAULS', 'PETERS', 'STEPHENS', 'THOMAS', 'MARGARETS', 'LUKES', 'MARKS', 'MATTHEWS', 'NICHOLAS', 'AUSTELL', 'BEES', 'HELIER', 'JUDES']);

function stripPunctuation(s: string): string {
  return s.replace(/[.,#'"’()\/\\&-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function expandTokens(s: string): string {
  const toks = s.split(' ').filter(Boolean);
  return toks.map((tok, i) => {
    /* PHASE 158b (F29, the Friary House run): "St Judes" read as STREET JUDES. A street word comes after the name, so an
       ST that opens a name of more than one word is a saint, whether or not the saint is on the list. */
    if (tok === 'ST') return SAINT_NAMES.has(toks[i + 1] ?? '') || (i === 0 && toks.length > 1) ? 'ST' : 'STREET';
    return STREET_SUFFIX_EXPANSIONS[tok] ?? tok;
  }).join(' ');
}

function norm(v: string | undefined): string {
  return v ? expandTokens(stripPunctuation(v.toUpperCase())) : '';
}

/** A UK postcode as outward + inward with one space, or '' when it is not one. */
export function postcodeKey(raw: string | undefined | null): string {
  if (typeof raw !== 'string') return '';
  const compact = raw.toUpperCase().replace(/\s+/g, '');
  const m = /^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/.exec(compact);
  return m ? `${m[1]} ${m[2]}` : '';
}

export function normalizeAddress(raw: RawAddress): NormalizedAddress {
  const key = postcodeKey(raw.postcode);
  return {
    paon: norm(raw.paon), saon: norm(raw.saon), street: norm(raw.street),
    locality: norm(raw.locality), town: norm(raw.town),
    postcode: key !== '' ? key : (raw.postcode ?? '').toUpperCase().trim(),
    postcodeKey: key,
  };
}

/* ================================================================== *
 * 3 · THE MAPPER — spec A.8 point 4
 *
 * A register gives up to four free address lines, and so does a person typing. The mapper joins the non-empty lines in
 * order, normalises them, and splits them: a leading sub-unit (UNIT, FLAT, SUITE, ROOM, a floor, or a letter after a
 * number) to `saon`; the first building number — or, where there is none, the first building name — to `paon`; the
 * street after it to `street`. A part it cannot place is left out, and scoring redistributes that weight.
 * THE MAPPER IS OUR DESIGN, NOT THE REGISTER'S. The measurement is what shows whether it splits real addresses well.
 * ================================================================== */

const SUB_UNIT = /^((?:UNIT|FLAT|SUITE|ROOM|APARTMENT|APT|STUDIO|BLOCK|BAY)\s+[A-Z0-9]+|(?:GROUND|FIRST|SECOND|THIRD|FOURTH|UPPER|LOWER|BASEMENT|TOP)(?:\s+GROUND)?\s+FLOOR)\b\s*(.*)$/;
const NUMBERED = /^(\d+)([A-Z])?(?:\s*-\s*\d+[A-Z]?)?\b\s*(.*)$/;
const STREET_WORD_INSIDE = /\b(?:ROAD|STREET|LANE|AVENUE|DRIVE|CLOSE|PLACE|WAY|GARDENS|CRESCENT|TERRACE|GROVE|SQUARE|PARADE|MEWS)\b/;
const STREET_WORD = /\b(ROAD|STREET|LANE|AVENUE|DRIVE|CLOSE|COURT|PLACE|WAY|GARDENS|CRESCENT|TERRACE|HILL|GROVE|SQUARE|PARADE|ROW|WALK|MEWS|GREEN|RISE|VIEW|PARK|BROADWAY|HIGHWAY|YARD|WHARF|QUAY|CHASE|VALE)$/;

export function addressFromLines(lines: readonly (string | null | undefined)[], postcode: string | null | undefined, town?: string | null): RawAddress {
  const t = norm(town ?? undefined);
  // A postcode written at the end of a line is not part of the address's words: it is dropped here and compared on its own.
  const segs = lines.flatMap((l) => (typeof l === 'string' ? l.split(',') : []))
    .map((s) => norm(s.replace(/\s*\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\s*$/i, '')))
    .filter((s) => s !== '' && s !== t && postcodeKey(s) === '');
  let saon = '';
  let paon = '';
  let street = '';
  const rest: string[] = [];

  const first = segs[0];
  if (first !== undefined) {
    const su = SUB_UNIT.exec(first);
    if (su) {
      saon = su[1] ?? '';
      segs[0] = su[2] ?? '';
      if (segs[0] === '') segs.shift();
    }
  }
  const at = segs.findIndex((s) => NUMBERED.test(s));
  if (at !== -1) {
    const m = NUMBERED.exec(segs[at] ?? '') as RegExpExecArray;
    paon = m[1] ?? '';
    if (m[2] && saon === '') saon = m[2];
    let after = m[3] ?? '';
    const next = segs[at + 1] ?? '';
    // A street ends at its street word: "INVENTED ROAD NOWHERE" is the street INVENTED ROAD in NOWHERE.
    const cut = STREET_WORD_INSIDE.exec(after);
    const tail = cut !== null ? after.slice(cut.index + cut[0].length).trim() : '';
    if (cut !== null && tail !== '') after = after.slice(0, cut.index + cut[0].length);
    if (after !== '' && (STREET_WORD.test(after) || next === '' || !STREET_WORD.test(next))) {
      street = after;
      rest.push(...segs.slice(0, at), ...(tail !== '' ? [tail] : []), ...segs.slice(at + 1));
    } else {
      // "14 PROSPECT HOUSE, CHURCH ROAD": the words after the number name the building; the street is the next line.
      street = next;
      rest.push(...segs.slice(0, at), ...(after !== '' ? [after] : []), ...segs.slice(at + 2));
    }
  } else if (segs.length > 0) {
    paon = segs[0] ?? '';
    street = segs[1] ?? '';
    rest.push(...segs.slice(2));
  }
  return { paon, saon, street, locality: rest.join(' '), town: t, postcode: postcode ?? '' };
}

/* ================================================================== *
 * 4 · SCORING — spec A.2 steps 3 and 4, and A.5
 * ================================================================== */

/** Jaro-Winkler similarity, 0..1. The spec's implementation. */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const matchDistance = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatches = new Array<boolean>(a.length).fill(false);
  const bMatches = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true; bMatches[j] = true; matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  t /= 2;
  const jaro = (matches / a.length + matches / b.length + (matches - t) / matches) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] !== b[i]) break;
    prefix++;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

/** Token-set Dice coefficient, 0..1. */
export function diceCoefficient(a: string, b: string): number {
  const ta = new Set(a.split(' ').filter(Boolean));
  const tb = new Set(b.split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const x of ta) if (tb.has(x)) shared++;
  return (2 * shared) / (ta.size + tb.size);
}

/** Step 3: score one postcode-blocked candidate. Only the components present on either side are weighed. */
export function scoreCandidate(subject: NormalizedAddress, candidate: NormalizedAddress): number {
  const hasSaonBoth = subject.saon !== '' && candidate.saon !== '';
  const paonWeight = hasSaonBoth ? 45 : 55;
  const streetWeight = hasSaonBoth ? 35 : 45;
  const saonWeight = hasSaonBoth ? 20 : 0;
  let total = 0;
  let maxPossible = 0;
  if (subject.paon !== '' || candidate.paon !== '') {
    const jw = jaroWinkler(subject.paon, candidate.paon);
    total += (jw >= 0.5 ? jw : 0) * paonWeight; // spec: ≥0.5 or contributes 0
    maxPossible += paonWeight;
  }
  if (subject.street !== '' || candidate.street !== '') {
    total += diceCoefficient(subject.street, candidate.street) * streetWeight;
    maxPossible += streetWeight;
  }
  if (hasSaonBoth) {
    total += (subject.saon === candidate.saon ? 1 : 0) * saonWeight;
    maxPossible += saonWeight;
  }
  return maxPossible === 0 ? 0 : total / maxPossible;
}

export type Candidate<T> = {
  readonly address: RawAddress;
  readonly payload: T;
  /**
   * PHASE 146h: what a person reads to tell this candidate from the next one, where the register's own address lines
   * are not what distinguishes them — a company name, for instance. Absent, `candidateLabel` writes the address out.
   * IT IS NEVER STORED AND NEVER LOGGED: it exists for the back-office pick, which holds it for one request (A.8
   * point 8), and for nothing else.
   */
  readonly label?: string;
};
export type Scored<T> = { readonly candidate: Candidate<T>; readonly score: number };

export type MatchResult<T> = {
  readonly status: MatchStatus;
  /** Only on ACCEPT. */
  readonly best: Scored<T> | null;
  /**
   * The highest-scoring candidate whatever the band, or null when none was scored. IN MEMORY ONLY: no connector keeps
   * it or passes it on. It exists for the 200-property measurement (tools/match-measure.ts), where a person judges
   * whether the top candidate was the right one.
   */
  readonly top: Scored<T> | null;
  /**
   * PHASE 146h: EVERY SCORED CANDIDATE, BEST FIRST. IN MEMORY ONLY, exactly as `top` is, and for one more reader:
   * the back-office pick (src/web/match-review.ts), where a person chooses one of them or none. No connector keeps
   * it, nothing writes it to the database, and no audit row carries it — a candidate's address lines are the
   * register's, under its own notice, and A.8 point 8 says they are not stored or logged.
   */
  readonly ranked: readonly Scored<T>[];
  /** How many candidates were scored. The candidates themselves are not handed on: nothing keeps them. */
  readonly scored: number;
  readonly top_score: number | null;
  /** In plain words, naming no address. */
  readonly why: string;
};

function classify<T>(scored: Scored<T>[], t: Thresholds, what: string): MatchResult<T> {
  if (scored.length === 0) {
    return { status: 'REJECT', best: null, top: null, ranked: [], scored: 0, top_score: null, why: `nothing on ${what} matched` };
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0] as Scored<T>;
  const tied = scored.filter((s) => s.score === top.score).length > 1;
  const pct = top.score.toFixed(2);
  const of = { top, ranked: scored, scored: scored.length, top_score: top.score };
  if (top.score >= t.accept && !tied) {
    return { status: 'ACCEPT', best: top, ...of, why: `matched on ${what}, scoring ${pct}` };
  }
  if (top.score >= t.accept && tied) {
    return { status: 'REVIEW', best: null, ...of,
      why: `more than one entry on ${what} matched equally well (${pct}), so none was chosen` };
  }
  if (top.score >= t.review) {
    return { status: 'REVIEW', best: null, ...of,
      why: `the closest entry on ${what} scored ${pct}, below the ${t.accept.toFixed(2)} we accept, so a person must choose` };
  }
  return { status: 'REJECT', best: null, ...of,
    why: `the closest entry on ${what} scored only ${pct}, so nothing matched` };
}

/**
 * THE WHOLE ADDRESS MATCH: postcode as the blocking key, then score, then band. A candidate at another postcode is never
 * scored (A.2 step 2). Several candidates with the same normalised address count as one (A.8 point 6): `pickAmongSame`
 * chooses which of them to keep, for example the latest certificate.
 */
export function matchAddress<T>(
  subjectRaw: RawAddress, candidates: readonly Candidate<T>[], t: Thresholds, what: string,
  pickAmongSame?: (a: T, b: T) => T,
): MatchResult<T> {
  const subject = normalizeAddress(subjectRaw);
  if (subject.postcodeKey === '') {
    return { status: 'INSUFFICIENT_INPUT', best: null, top: null, ranked: [], scored: 0, top_score: null, why: 'there is no postcode we can read, so no lookup was matched' };
  }
  const byAddress = new Map<string, Candidate<T>>();
  for (const c of candidates) {
    const n = normalizeAddress(c.address);
    if (n.postcodeKey !== subject.postcodeKey) continue;
    const k = [n.saon, n.paon, n.street].join('|');
    const had = byAddress.get(k);
    byAddress.set(k, had === undefined || pickAmongSame === undefined ? (had ?? c) : { address: had.address, payload: pickAmongSame(had.payload, c.payload) });
  }
  const scored = [...byAddress.values()].map((c) => ({ candidate: c, score: scoreCandidate(subject, normalizeAddress(c.address)) }));
  return classify(scored, t, what);
}

/* ================================================================== *
 * 5 · COMPANY NAMES — the Companies House search
 *
 * Companies House is searched on the business's name. Its search returns several companies, and the name a client types
 * is often a trading name, a slight misspelling or a group company's. So the same bands apply: only one clear ACCEPT
 * is taken. A company NUMBER, where the client gave one, is an exact key and needs no score.
 * NO MATCH IS NOT A SOLE TRADER. It is no match, and the fact stays asked.
 * ================================================================== */

const COMPANY_SUFFIXES = /\b(LIMITED LIABILITY PARTNERSHIP|LIMITED|LTD|PLC|LLP|CIC|CYFYNGEDIG|CYF|COMMUNITY INTEREST COMPANY|UNLIMITED)\b/g;

export function normalizeCompanyName(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return '';
  return stripPunctuation(raw.toUpperCase().replace(/&/g, ' AND '))
    .replace(/^THE\s+/, '').replace(COMPANY_SUFFIXES, ' ').replace(/\s+/g, ' ').trim();
}

/** Half Jaro-Winkler on the whole name, half token-set Dice, so a reordered name and a misspelt one both score. */
export function scoreCompanyName(a: string, b: string): number {
  const x = normalizeCompanyName(a);
  const y = normalizeCompanyName(b);
  if (x === '' || y === '') return 0;
  return (jaroWinkler(x, y) + diceCoefficient(x, y)) / 2;
}

export function matchCompanyName<T>(
  typed: string | null | undefined, candidates: readonly { readonly name: string; readonly payload: T }[], t: Thresholds,
): MatchResult<T> {
  if (normalizeCompanyName(typed) === '') {
    return { status: 'INSUFFICIENT_INPUT', best: null, top: null, ranked: [], scored: 0, top_score: null, why: 'there is no business name we can search on' };
  }
  const scored = candidates.map((c) => ({ candidate: { address: {}, payload: c.payload, label: c.name }, score: scoreCompanyName(typed ?? '', c.name) }));
  return classify(scored, t, 'Companies House');
}

/**
 * THE MEASUREMENT HOOK. An address connector's query may carry `measure`, and the connector hands it each match it
 * scores. ONLY tools/match-measure.ts sets it; the research flow never does (test/phase146c.test.ts checks that no query
 * FREE_CONNECTORS builds carries one). What it sees stays in memory in that tool, run only with the data protection
 * officer's permission.
 */
export type MeasureHook = (seen: {
  readonly profile: MatchProfile;
  readonly register?: string;
  readonly match: MatchResult<unknown>;
  /** The top candidate's address as the register wrote it — for the person judging the match. */
  readonly top_address: RawAddress | null;
}) => void;

/* ================================================================== *
 * 6 · A PERSON'S PICK FOR A CLOSE MATCH — the S10 spec, A.2 step 4 and A.8 point 7
 *
 * Phase 146h, 23 September 2026.
 *
 * A.2 step 4 says of the REVIEW band: "never auto-selected. Full candidate list (all postcode-blocked candidates,
 * ranked) is surfaced to ops/surveyor for manual pick. Nothing is written until a human resolves it." Until this
 * phase there was nowhere to surface it to, so a REVIEW ended the lookup and kept nothing.
 *
 * THE BAND IS THE WHOLE RULE, AND IT IS THE ONE THING NOT TO WIDEN. Only a REVIEW is offered and only a REVIEW may be
 * picked from. A REJECT means nothing at the postcode came close and a person choosing from it would be choosing
 * between wrong answers; an ACCEPT is already decided; INSUFFICIENT_INPUT and NOT_COVERED never scored anything. So
 * `applyPick` returns NOT_PICKING for every status but REVIEW, whatever the caller asked for.
 *
 * WHEN IT MAY BE OFFERED AT ALL is not this file's to say. A.8 point 7 rules out showing a prospect other buildings'
 * records, so the pick is a BACK-OFFICE thing and it waits for a signed engagement. That gate is asserted in
 * src/web/match-review.ts, server-side, against the record — the same place and the same way as the paid tier's.
 *
 * NOTHING HERE IS KEPT. The offer is built from `ranked`, which lives for the length of one request. What a pick
 * writes is the chosen candidate's own permitted fields, through the one door, and the choice itself: who, when, and
 * the score. Never the list, never a candidate's address lines (A.8 point 8).
 * ================================================================== */

/** One candidate as a person reads it. Held for one request and then gone. */
export type ReviewCandidate = {
  /** The candidate's own key in the register — a certificate number, a location id, a transaction id, a company number. */
  readonly key: string;
  readonly score: number;
  /** What tells it apart from the next one, in the register's own words. */
  readonly label: string;
  /** Which sub-register it came from, where a lookup searches more than one. Null where there is only one. */
  readonly register: string | null;
};

/** What a connector hands the back office when a match lands in the REVIEW band. Set by the pick and by nothing else. */
export type ReviewHook = (offer: {
  readonly profile: MatchProfile;
  readonly register: string | null;
  readonly candidates: readonly ReviewCandidate[];
  readonly why: string;
}) => void;

/**
 * THE TWO THINGS A PICK ADDS TO A LOOKUP'S QUERY, and the research flow sets NEITHER — exactly as it sets no
 * `measure` hook. A test walks every query FREE_CONNECTORS and PAID_CONNECTORS build for an ordinary click and
 * asserts that both are absent.
 */
export type PickQuery = {
  /** Called with the ranked list when the match is REVIEW and no choice has been made. */
  readonly review?: ReviewHook;
  /** A candidate's `key`, when a person has chosen one. Null or absent is not a choice. */
  readonly chosen?: string | null;
  /**
   * Called with what the chosen candidate scored ON THIS FETCH, when `chosen` was found. It is how the score reaches
   * the record of the decision without a third lookup — the alternative was fetching the same list again purely to
   * read a number off it, which is a call to the supplier for nothing.
   *
   * THE SCORE IS THIS FETCH'S, NOT THE ONE THE PERSON WAS SHOWN, and the two can differ if the register answered
   * differently in between. This one is the honest figure: it belongs to the candidate actually being stored.
   */
  readonly picked?: (p: { readonly key: string; readonly score: number }) => void;
};

export type PickOutcome<T> =
  /** A person's choice, found in the list the register gave us on THIS request. */
  | { readonly kind: 'CHOSEN'; readonly best: Scored<T> }
  /**
   * A choice was made and the register no longer offers it. The lookup keeps NOTHING: between the list being shown
   * and the choice being made the register answered differently, and the candidate a person actually looked at is
   * not the one we would be storing. Taking the nearest one instead would be the auto-selection A.2 step 4 forbids.
   */
  | { readonly kind: 'GONE' }
  /** No choice to apply. The caller goes on exactly as it did before this phase. */
  | { readonly kind: 'NOT_PICKING' };

/** The register's own words for one candidate, built from the lines it gave us. Read on a screen; never stored. */
export function candidateLabel<T>(c: Candidate<T>): string {
  if (typeof c.label === 'string' && c.label.trim() !== '') return c.label.trim();
  const a = c.address;
  const parts = [a.saon, a.paon, a.street, a.locality, a.town, a.postcode]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter((p) => p !== '');
  return parts.length === 0 ? 'an entry with no address' : parts.join(', ');
}

/**
 * OFFER THE LIST, OR APPLY THE CHOICE. Called by every connector that scores candidates, at the point where it would
 * otherwise return NOT_MATCHED.
 *
 * `keyOf` is the candidate's own key in the register. It must be the key the connector would fetch the record BY, so
 * that a choice names a record rather than a position in a list: a list re-fetched on the next request may be in a
 * different order, and an index would then choose a different building.
 */
export function applyPick<T>(
  m: MatchResult<T>,
  q: PickQuery | undefined,
  what: {
    readonly profile: MatchProfile;
    /** Where the whole list came from, where one search produced it. */
    readonly register?: string | null;
    readonly keyOf: (payload: T) => string;
    /** Where THIS candidate came from, where a lookup pools several registers (the energy certificates do). */
    readonly registerOf?: (payload: T) => string | null;
  },
): PickOutcome<T> {
  if (m.status !== 'REVIEW') return { kind: 'NOT_PICKING' };
  const chosen = typeof q?.chosen === 'string' && q.chosen.trim() !== '' ? q.chosen.trim() : null;
  if (chosen === null) {
    q?.review?.({
      profile: what.profile,
      register: what.register ?? null,
      why: m.why,
      candidates: m.ranked.map((s) => ({
        key: what.keyOf(s.candidate.payload), score: s.score,
        label: candidateLabel(s.candidate),
        register: what.registerOf?.(s.candidate.payload) ?? what.register ?? null,
      })),
    });
    return { kind: 'NOT_PICKING' };
  }
  const found = m.ranked.find((s) => what.keyOf(s.candidate.payload) === chosen);
  if (found === undefined) return { kind: 'GONE' };
  q?.picked?.({ key: chosen, score: found.score });
  return { kind: 'CHOSEN', best: found };
}

/** The words a lookup reports when a person chose it, with the score they were shown. */
export function pickedNote(score: number, what: string): string {
  return `a person in the back office chose this one from ${what}, where it scored ${score.toFixed(2)} — ` +
    'it was not close enough for us to choose it ourselves';
}

/** The words a lookup reports when the chosen entry is no longer there. */
export const PICK_GONE_WHY =
  'the entry that was chosen is no longer on the register’s list for this address, so nothing was kept. ' +
  'Look at the list again and choose from what is there now';
