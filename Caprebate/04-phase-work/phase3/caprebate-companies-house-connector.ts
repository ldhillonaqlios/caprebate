/**
 * Caprebate — Companies House connector: the person-match rule, and nothing else yet.
 * Board item 12830181797 (Item 5, Companies House Integration). Phase 132, 14 September 2026.
 *
 * WHERE THIS SITS. The specification names this file `companies-house-connector.ts`
 * and places `sameIndividual()` in it, beside `buildGroupCommonControl`. It carries
 * the phase3 `caprebate-` prefix like every other module here.
 *
 * WHAT IS BUILT, AND WHAT IS DELIBERATELY NOT. PURE LOGIC ONLY. No network call, no
 * HTTP client, no API key, no rate-limit retry, no parser of a live response. The
 * connector proper — fetching a PSC list — is not built, and nothing in this file
 * can reach Companies House.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * SAFEGUARD S5: AN UNCORROBORATED PERSON MATCH IS SURFACED TO A PERSON, NEVER
 * ACTED ON.
 *
 * Two different people can share a name. The specification's edge case 5 says so
 * and sets the rule: "If either side lacks date_of_birth, sameIndividual() returns
 * false (unconfirmed) rather than guessing". What a match decides is common control
 * for the Annual Investment Allowance test — the £1m allowance is shared across
 * commonly controlled businesses — so a wrong match takes allowance away from a
 * client on the strength of a coincidence of names.
 *
 * THE SPEC'S OWN SKETCH RETURNED A BOOLEAN, AND THIS DOES NOT, ON PURPOSE. A bare
 * `false` merges four different findings — the names differ, a name is missing, the
 * names agree but the birth month is unknown, and the switch is off — and only the
 * first of those is a finding that the two are different people. The other three
 * are "we cannot say", and each goes to a person. So the result names which it is.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * BUILT AND SWITCHED OFF.
 *
 * `SAME_INDIVIDUAL.enabled` ships false. While it is off NOTHING CORROBORATES, and
 * every call is surfaced to a person. Nothing imports this module on a live path —
 * a test scans for exactly that. Turning it on is the decision that a name plus a
 * birth month and year is enough to treat two PSC records as one individual; that
 * is a data protection and tax adviser decision, not a build step.
 */

/* ------------------------------------------------------------------ *
 * 1. The storage shape the specification fixes
 * ------------------------------------------------------------------ */

/**
 * The part of the specification's PscIndividualStorageRecord this rule reads.
 *
 * Only the MONTH and YEAR of birth. Never the day: the name exclusion register's
 * CH_PSC policy excludes `psc_dob_day`, and Exception 1 keeps "name, birth
 * month/year and nationality — never day of birth, never an address". An extra
 * `day` property on a record passed in is not read — a test asserts it changes
 * nothing.
 */
export type PscPersonForMatch = {
  readonly psc_name: unknown;
  readonly dob_month_year: unknown;
};

export type MonthYear = { readonly month: number; readonly year: number };

/* ------------------------------------------------------------------ *
 * 2. N4 — a birth month and year is KNOWN, or it is not there
 * ------------------------------------------------------------------ */

/**
 * The spellings of "I don't know".
 *
 * COPIED, NOT IMPORTED, from `DONT_KNOW` in 09-app/backend/src/web/funnel-session.ts
 * — "not sure", "dont_know" and "unsure". Phase3 modules are the authorities the
 * back end imports; a phase3 module importing the back end would reverse that, so
 * the three strings are restated here and the day that list changes, this one has
 * to be changed with it.
 */
const DONT_KNOW: ReadonlySet<string> = new Set(['not sure', 'dont_know', 'unsure']);

/** A plausible birth year for a living person with significant control. */
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

/**
 * A month and year only where BOTH are known integers in range; null otherwise.
 *
 * NULL FOR EVERY KIND OF NOT KNOWING, AND THEY ARE NOT TOLD APART. undefined, null,
 * the empty string, every "I don't know", a partial object with only one of the two
 * parts, a month of 13, a year of 1850, a string "3" — all return null. N4: an
 * answer of "not sure" and an answer never recorded behave identically here, and
 * neither becomes a month of zero that could be compared equal to another zero.
 */
export function knownMonthYear(v: unknown): MonthYear | null {
  if (v === undefined || v === null) return null;
  /* A STRING IS NEVER A MONTH AND YEAR. "", "not sure", "unsure" and "dont_know"
     all land here and all return null — the same null an absent value gets, so
     "I don't know" and "never recorded" cannot be told apart downstream. */
  if (typeof v === 'string') return null;
  if (typeof v !== 'object') return null;
  const o = v as { month?: unknown; year?: unknown };
  const { month, year } = o;
  if (typeof month !== 'number' || !Number.isInteger(month) || month < 1 || month > 12) return null;
  if (typeof year !== 'number' || !Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) return null;
  return { month, year };
}

/** A name only where one was actually given. The specification's own normalisation. */
function knownName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const n = v.trim().toLowerCase().replace(/\s+/g, ' ');
  if (n === '' || DONT_KNOW.has(n)) return null;
  return n;
}

/* ------------------------------------------------------------------ *
 * 3. The switch
 * ------------------------------------------------------------------ */

export type SameIndividualSwitches = { readonly enabled: boolean };

/**
 * SHIPPED OFF. While off, `sameIndividual` corroborates nothing and surfaces every
 * pair to a person — the status is SWITCHED_OFF whatever the records say, so an
 * off switch can never be read as a finding about the two people.
 */
export const SAME_INDIVIDUAL: SameIndividualSwitches = Object.freeze({ enabled: false });

/* ------------------------------------------------------------------ *
 * 4. The rule
 * ------------------------------------------------------------------ */

export type MatchStatus =
  /** Same normalised name, and both birth months and years known and equal. The only acting status. */
  | 'CORROBORATED'
  /** Same name, but a birth month or year is missing, unknown or different on either side. */
  | 'UNCORROBORATED'
  /** Both names known and they differ. A finding that these are two people. */
  | 'NAME_DIFFERS'
  /** A name is missing or unknown on either side. */
  | 'NAME_NOT_KNOWN'
  /** The switch is off. Says nothing about the people. */
  | 'SWITCHED_OFF';

export type MatchResult = {
  readonly corroborated: boolean;
  readonly status: MatchStatus;
  /** S5. True for everything except a corroborated match and a proven name difference. */
  readonly surface_to_person: boolean;
};

/**
 * Are these two PSC records the same individual?
 *
 * THE ONLY PATH TO `corroborated: true` is: the switch on, both names known and
 * equal after normalisation, and both birth months and years KNOWN and equal. Every
 * other path returns false, and every one of those except a proven name difference
 * is surfaced to a person rather than treated as "not the same person".
 */
export function sameIndividual(
  a: PscPersonForMatch,
  b: PscPersonForMatch,
  switches: SameIndividualSwitches = SAME_INDIVIDUAL,
): MatchResult {
  if (switches.enabled !== true) {
    return { corroborated: false, status: 'SWITCHED_OFF', surface_to_person: true };
  }
  const na = knownName(a.psc_name);
  const nb = knownName(b.psc_name);
  if (na === null || nb === null) {
    return { corroborated: false, status: 'NAME_NOT_KNOWN', surface_to_person: true };
  }
  if (na !== nb) {
    return { corroborated: false, status: 'NAME_DIFFERS', surface_to_person: false };
  }
  const da = knownMonthYear(a.dob_month_year);
  const db = knownMonthYear(b.dob_month_year);
  if (da !== null && db !== null && da.month === db.month && da.year === db.year) {
    return { corroborated: true, status: 'CORROBORATED', surface_to_person: false };
  }
  return { corroborated: false, status: 'UNCORROBORATED', surface_to_person: true };
}
