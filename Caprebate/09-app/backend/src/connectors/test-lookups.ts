/**
 * THE TEST LOOKUPS LAKHBIR ALLOWED, AND THE FIVE CONDITIONS HE ALLOWED THEM ON. Phase 151g, 28 September 2026.
 *
 * Word question 170, "Can we make a few small, logged test lookups to check a data connector works?", was answered
 * on 25 September 2026 by Lakhbir Dhillon, Head of Business Development (the director is Jalil Ahmed; corrected
 * 4 October 2026, Phase 153c): yes, on five conditions, in his words —
 *
 *   1. no more than three lookups per connector each time it is switched on;
 *   2. never a client's property;
 *   3. keep only pass or fail, the time and the connector;
 *   4. log who ran it and why;
 *   5. never use it to show the product to clients.
 *
 * Until this file the smoke test (src/connectors/smoke.ts, Phase 146g) enforced none of them: it printed a warning,
 * kept its audit row in a database in memory that vanished with the run, and would take a client's postcode if one
 * were typed. This file is what the `smoke` command now runs, and each condition is a REFUSAL, not a sentence:
 *
 *   WHO AND WHY        --who and --why are required; an empty one, or one that is really the next flag, is refused.
 *   A LOG THAT LASTS   one JSON line per lookup in a file OUTSIDE the repository — CAPREBATE_TEST_LOOKUP_LOG, or
 *                      ~/.caprebate-test-lookups.jsonl — refused inside the tree the way src/secrets.ts refuses a key
 *                      file there. A line holds the connector, the time, PASS or NO, who and why — and, where it was
 *                      given, that --not-a-client was. NEVER THE VALUES ASKED, NEVER THE ANSWER: `lookupLine` builds
 *                      every line from those fields and nothing else.
 *   THREE PER SWITCH-ON  a connector's lookup lines are counted from its last "switched on" line, and a fourth is
 *                      refused. `smoke-switched-on` is the only thing that writes a "switched on" line, and so the only
 *                      way the count starts again. A connector with no "switched on" line has not been switched on,
 *                      and its first lookup is refused until a person records that it was.
 *   NEVER A CLIENT     with CAPREBATE_DB set, a postcode, company number or company name matching any business,
 *                      property or lead held there is refused; the refusal names the field, never the value. Without
 *                      it, anything but SMOKE_DEFAULTS is refused unless --not-a-client is given, and the line says so.
 *   NOT A DEMONSTRATION  said on every run, before anything else, and the why is on every line.
 *
 * A LOOKUP THAT CANNOT BE LOGGED IS NOT MADE. The log is read, and opened for appending, before the call; a log that
 * cannot be read line for line (so the count cannot be known) refuses, because an unknown count is not a count under
 * three. A lookup that throws is still logged, as NO, before the error goes on.
 *
 * PHASE 151l, 28 SEPTEMBER 2026: THE LAND BOUNDARY IS A SOURCE HERE TOO. `smoke HMLR_INSPIRE` downloads one council's
 * file under the same five conditions, on the same log, through the same refusals below — only the values asked about
 * (a point and a council, not a company and a postcode) and the call itself are src/connectors/boundary-test-lookup.ts's.
 * `smoke-switched-on HMLR_INSPIRE` starts its count of three like any other connector's.
 *
 * NOTHING HERE READS THE KEY FILE OR REACHES THE NETWORK. The caller hands in the transport and the key store:
 * src/cli.ts hands in the live ones, and the tests hand in recorded answers.
 */

import { appendFileSync, closeSync, existsSync, openSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

import { AuditLog } from '../audit.ts';
import { Db, migrate } from '../db.ts';
import { MIGRATIONS_DIR } from '../app.ts';
import { isInside, repositoryRoot, type SecretStore } from '../secrets.ts';
import type { Transport } from './http.ts';
import type { PostcodeStore } from '../web/postcode-port.ts';
import { smokeOne, SMOKE_DEFAULTS, SMOKE_SOURCES, type SmokeValues } from './smoke.ts';
import type { Nation } from './nations.ts';
import {
  BOUNDARY_TEST_DEFAULTS, BOUNDARY_TEST_SOURCE, boundaryClientMatchIn, boundaryTestOne, boundaryValuesFrom, notTheBoundaryDefaults,
} from './boundary-test-lookup.ts';
import { buildingsAround, OS_SERVICE_ID } from './os-buildings.ts';

/** PHASE 156a: the Ordnance Survey building outlines (the report's site plan). Only ever at the public test point. */
export const OS_TEST_SOURCE = OS_SERVICE_ID;

/**
 * EVERY CONNECTOR A TEST LOOKUP CAN BE RUN FOR: the registers the smoke test knows, and (Phase 151l) the land boundary
 * download. One list, so `smoke` and `smoke-switched-on` can never disagree about what a connector is.
 */
export const TEST_LOOKUP_SOURCES: readonly string[] = Object.freeze([...Object.keys(SMOKE_SOURCES), BOUNDARY_TEST_SOURCE, OS_TEST_SOURCE]);
const isTestLookupSource = (s: string): boolean => TEST_LOOKUP_SOURCES.includes(s);

/** Condition 1, in Lakhbir's number. */
export const TEST_LOOKUPS_PER_SWITCH_ON = 3;

export const DEFAULT_TEST_LOOKUP_LOG = '~/.caprebate-test-lookups.jsonl';

/** The five conditions, as the command prints them on every run. */
export const TEST_LOOKUP_CONDITIONS: readonly string[] = Object.freeze([
  `1. No more than ${TEST_LOOKUPS_PER_SWITCH_ON} lookups per connector each time it is switched on: a fourth is refused.`,
  '2. Never a client’s property: a postcode, company number or name held in the database is refused.',
  '3. Only pass or fail, the time and the connector are kept: never what was asked, never the answer.',
  '4. Who ran it and why are written in the log, and it will not run without them.',
  '5. It is never used to show the product to a client.',
]);

export const NOT_A_DEMONSTRATION =
  'THIS IS A TEST OF A CONNECTION, NOT A DEMONSTRATION. Never run it to show the product to a client: why you ran it is kept.';

/* ------------------------------------------------------------------ the log */

export type SwitchedOnLine = {
  readonly kind: 'switched_on';
  readonly connector: string;
  readonly at: string;
  readonly who: string;
  readonly why: string;
};

export type LookupLine = {
  readonly kind: 'lookup';
  readonly connector: string;
  readonly at: string;
  readonly result: 'PASS' | 'NO';
  readonly who: string;
  readonly why: string;
  /** Present, and true, only where --not-a-client was given. */
  readonly not_a_client?: true;
};

export type TestLookupLine = SwitchedOnLine | LookupLine;

/** The log's path: CAPREBATE_TEST_LOOKUP_LOG, or the default, with `~` expanded. Not yet checked. */
export function testLookupLogPath(env: Record<string, string | undefined> = process.env): string {
  const raw = (env.CAPREBATE_TEST_LOOKUP_LOG ?? '').trim() || DEFAULT_TEST_LOOKUP_LOG;
  const expanded = raw === '~' ? homedir() : raw.startsWith('~/') ? join(homedir(), raw.slice(2)) : raw;
  return isAbsolute(expanded) ? expanded : resolve(expanded);
}

export type LogRead =
  | { readonly ok: true; readonly path: string; readonly lines: readonly TestLookupLine[] }
  | { readonly ok: false; readonly why: string };

function isLine(v: unknown): v is TestLookupLine {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  const text = (k: string): boolean => typeof o[k] === 'string' && (o[k] as string).trim() !== '';
  if (!text('connector') || !text('at') || !text('who') || !text('why')) return false;
  if (o.kind === 'switched_on') return true;
  return o.kind === 'lookup' && (o.result === 'PASS' || o.result === 'NO');
}

/**
 * THE LOG, READ WHOLE, OR A REFUSAL. A path inside the repository is refused before it is opened (a log inside the
 * tree is a log `git add` can publish). No file yet is an empty log. A line that is not one of ours means the count
 * cannot be trusted, and the answer is a refusal, never a guess.
 */
export function readTestLookupLog(env: Record<string, string | undefined> = process.env, repoRoot: string = repositoryRoot()): LogRead {
  const path = testLookupLogPath(env);
  if (isInside(path, repoRoot)) {
    return { ok: false, why: `the test lookup log may not be inside the repository (${repoRoot}): set CAPREBATE_TEST_LOOKUP_LOG to a file outside it, or leave it unset for ${DEFAULT_TEST_LOOKUP_LOG}` };
  }
  if (!existsSync(path)) return { ok: true, path, lines: [] };
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e: unknown) {
    return { ok: false, why: `the test lookup log ${path} could not be read (${e instanceof Error ? e.message : String(e)}), so the count is not known` };
  }
  const lines: TestLookupLine[] = [];
  const raw = text.split('\n');
  for (let i = 0; i < raw.length; i++) {
    const t = (raw[i] ?? '').trim();
    if (t === '') continue;
    let v: unknown;
    try { v = JSON.parse(t); } catch { v = null; }
    if (!isLine(v)) return { ok: false, why: `line ${i + 1} of the test lookup log ${path} is not one this command wrote, so the count is not known. Nothing was changed` };
    lines.push(v);
  }
  return { ok: true, path, lines };
}

export type SwitchCount =
  | { readonly switched_on: false }
  | { readonly switched_on: true; readonly since: SwitchedOnLine; readonly used: number };

/** How many lookups a connector has had since its last "switched on" line — or that it has never had one. */
export function lookupsSinceSwitchOn(lines: readonly TestLookupLine[], connector: string): SwitchCount {
  let since: SwitchedOnLine | null = null;
  let used = 0;
  for (const l of lines) {
    if (l.connector !== connector) continue;
    if (l.kind === 'switched_on') { since = l; used = 0; } else used++;
  }
  return since === null ? { switched_on: false } : { switched_on: true, since, used };
}

/** A lookup line, built from the fields Lakhbir named and from nothing else. */
export function lookupLine(connector: string, at: string, result: 'PASS' | 'NO', who: string, why: string, not_a_client: boolean): LookupLine {
  return not_a_client
    ? { kind: 'lookup', connector, at, result, who, why, not_a_client: true }
    : { kind: 'lookup', connector, at, result, who, why };
}

function append(path: string, line: TestLookupLine): void {
  appendFileSync(path, JSON.stringify(line) + '\n', { encoding: 'utf8', mode: 0o600 });
}

/** Opened for appending and closed again, so a log that cannot be written refuses BEFORE a call is made. */
function writable(path: string): string | null {
  try {
    closeSync(openSync(path, 'a', 0o600));
    return null;
  } catch (e: unknown) {
    return `the test lookup log ${path} cannot be written (${e instanceof Error ? e.message : String(e)}), and a lookup that cannot be logged is not made`;
  }
}

/* ------------------------------------------------------------------ never a client */

export const normalisePostcode = (s: string): string => s.toUpperCase().replace(/\s+/g, '');

export function normaliseCompanyNumber(s: string): string {
  const t = s.toUpperCase().replace(/\s+/g, '');
  return /^\d{1,7}$/.test(t) ? t.padStart(8, '0') : t;
}

export function normaliseCompanyName(s: string): string {
  return s.toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ public limited company$/, ' plc')
    .replace(/ limited$/, ' ltd');
}

export type ClientCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly why: string };

/**
 * CONDITION 2 AGAINST THE DATABASE. Every business (its name, its legal name, its company number), every property
 * (its postcode) and every lead (its organisation, its postcode) is read and compared after normalising — so
 * "sw1a2as" is "SW1A 2AS" and "1234567" is "01234567". A match refuses and names the FIELD, never the value. An empty
 * value checks nothing. A database that cannot be read refuses: not knowing is not a pass.
 */
export function clientMatchIn(db: Db, v: SmokeValues): ClientCheck {
  let businesses: { name: string | null; legal_name: string | null; company_number: string | null }[];
  let properties: { postcode: string | null }[];
  let leads: { prospect_organisation: string | null; prospect_postcode: string | null }[];
  try {
    businesses = db.all('SELECT name, legal_name, company_number FROM businesses');
    properties = db.all('SELECT postcode FROM properties');
    leads = db.all('SELECT prospect_organisation, prospect_postcode FROM leads');
  } catch (e: unknown) {
    return { ok: false, why: `the clients in CAPREBATE_DB could not be read (${e instanceof Error ? e.message : String(e)}), so it is not known that these values are nobody's` };
  }
  const has = (s: string | null, want: string, norm: (x: string) => string): boolean => s !== null && s.trim() !== '' && norm(s) === want;
  const pc = normalisePostcode(v.postcode);
  const cn = normaliseCompanyNumber(v.company_number);
  const nm = normaliseCompanyName(v.company_name);
  if (pc !== '' && (properties.some((p) => has(p.postcode, pc, normalisePostcode)) || leads.some((l) => has(l.prospect_postcode, pc, normalisePostcode)))) {
    return { ok: false, why: 'the postcode is held in the database against a client or a lead' };
  }
  if (cn !== '' && businesses.some((b) => has(b.company_number, cn, normaliseCompanyNumber))) {
    return { ok: false, why: 'the company number is held in the database against a client' };
  }
  if (nm !== '' && (businesses.some((b) => has(b.name, nm, normaliseCompanyName) || has(b.legal_name, nm, normaliseCompanyName))
      || leads.some((l) => has(l.prospect_organisation, nm, normaliseCompanyName)))) {
    return { ok: false, why: 'the company name is held in the database against a client or a lead' };
  }
  return { ok: true };
}

/** The fields whose value is not the public default, by name. Compared after the same normalising. */
export function notTheDefaults(v: SmokeValues): string[] {
  const d = SMOKE_DEFAULTS;
  const out: string[] = [];
  if (normaliseCompanyNumber(v.company_number) !== normaliseCompanyNumber(d.company_number)) out.push('company number');
  if (normaliseCompanyName(v.company_name) !== normaliseCompanyName(d.company_name)) out.push('company name');
  if (normaliseCompanyName(v.address_line_1) !== normaliseCompanyName(d.address_line_1)) out.push('address');
  if (normaliseCompanyName(v.town) !== normaliseCompanyName(d.town)) out.push('town');
  if (normalisePostcode(v.postcode) !== normalisePostcode(d.postcode)) out.push('postcode');
  return out;
}

/**
 * CONDITION 2, ONCE, FOR EVERY CONNECTOR. With CAPREBATE_DB, the connector's own `matchIn` compares its values with what
 * the database holds (a register's: clientMatchIn; the land boundary's: boundaryClientMatchIn). Without it, the fields
 * `changed` from the public defaults are refused unless --not-a-client was said out loud.
 */
function clientCheck(env: Record<string, string | undefined>, matchIn: (db: Db) => ClientCheck, changed: readonly string[], not_a_client: boolean): ClientCheck {
  const location = (env.CAPREBATE_DB ?? '').trim();
  if (location !== '') {
    if (!existsSync(location)) return { ok: false, why: `CAPREBATE_DB names ${location}, which is not there, so it is not known that these values are nobody's` };
    let db: Db | null = null;
    try {
      db = new Db(location);
      return matchIn(db);
    } catch (e: unknown) {
      return { ok: false, why: `CAPREBATE_DB could not be opened (${e instanceof Error ? e.message : String(e)}), so it is not known that these values are nobody's` };
    } finally {
      db?.close();
    }
  }
  if (changed.length > 0 && !not_a_client) {
    return { ok: false, why: `the ${changed.join(', ')} ${changed.length === 1 ? 'is' : 'are'} not the public test value, and with no CAPREBATE_DB there is nothing to check it against. Set CAPREBATE_DB, or give --not-a-client to say it belongs to nobody we act for (the log will say you did)` };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ the two commands */

export type Say = (line: string) => void;

export type CommandDeps = {
  readonly now: () => string;
  readonly out: Say;
  readonly err: Say;
  /** The repository a log may not sit in. src/secrets.ts's own, unless a test says otherwise. */
  readonly repoRoot?: string;
};

export type SmokeCommandDeps = CommandDeps & {
  readonly transport: Transport;
  readonly secrets: SecretStore;
  readonly postcodeStore?: PostcodeStore | null;
  readonly sleep?: (ms: number) => Promise<void>;
};

/** `--name value`. A flag with no value, or whose value is the next flag, reads as absent. */
function flag(argv: readonly string[], name: string): string | null {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return null;
  const v = argv[i + 1];
  return typeof v === 'string' && !v.startsWith('--') ? v : null;
}

/** Condition 4: who and why, both, and neither empty. A sentence saying what is missing when they are not. */
function whoAndWhy(argv: readonly string[]): { who: string; why: string } | string {
  const who = (flag(argv, 'who') ?? '').trim();
  const why = (flag(argv, 'why') ?? '').trim();
  const missing = [who === '' ? '--who' : null, why === '' ? '--why' : null].filter((x) => x !== null);
  if (missing.length > 0) return `refused: ${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} required and may not be empty — who is running this, and why`;
  return { who, why };
}

const SMOKE_USAGE = 'usage: CAPREBATE_LIVE_SMOKE=1 node src/cli.ts smoke <SOURCE> --who "<name>" --why "<reason>" [--postcode P] [--company-number N] [--company-name X] [--address A] [--town T] [--nation england|wales|scotland|northern_ireland] [--council C] [--not-a-client]\n' +
  `       CAPREBATE_LIVE_SMOKE=1 node src/cli.ts smoke OS_FEATURES --who "<name>" --why "<reason>"   (the public test point only)\n` +
  `       CAPREBATE_LIVE_SMOKE=1 node src/cli.ts smoke ${BOUNDARY_TEST_SOURCE} --who "<name>" --why "<reason>" [--easting E --northing N] [--council <ONS code or HM Land Registry file name>] [--not-a-client]`;
/** The four values --nation takes (src/connectors/nations.ts). */
const SMOKE_NATIONS: readonly string[] = ['england', 'wales', 'scotland', 'northern_ireland'];
const SWITCH_USAGE = 'usage: node src/cli.ts smoke-switched-on <SOURCE> --who "<name>" --why "<reason>"';

/**
 * `smoke-switched-on <SOURCE> --who --why` — A PERSON RECORDS THAT A CONNECTOR HAS BEEN SWITCHED ON. It makes no call
 * and changes no switch: it writes one line, and that line is where the connector's count of three starts again.
 */
export function runSwitchedOnCommand(argv: readonly string[], env: Record<string, string | undefined>, d: CommandDeps): number {
  const source_id = (argv[0] ?? '').toUpperCase();
  if (source_id === '' || source_id.startsWith('--') || !isTestLookupSource(source_id)) {
    d.err(SWITCH_USAGE);
    d.err(`sources: ${TEST_LOOKUP_SOURCES.join(', ')}`);
    return 1;
  }
  const ww = whoAndWhy(argv);
  if (typeof ww === 'string') { d.err(ww); return 1; }
  const log = readTestLookupLog(env, d.repoRoot ?? repositoryRoot());
  if (!log.ok) { d.err(`refused: ${log.why}`); return 1; }
  const cannot = writable(log.path);
  if (cannot !== null) { d.err(`refused: ${cannot}`); return 1; }
  const at = d.now();
  append(log.path, { kind: 'switched_on', connector: source_id, at, who: ww.who, why: ww.why });
  d.out(`Recorded: ${source_id} switched on at ${at}, by ${ww.who}.`);
  d.out(`Its count starts again: 0 of ${TEST_LOOKUPS_PER_SWITCH_ON} test lookups used. Logged in ${log.path}.`);
  return 0;
}

/**
 * `smoke <SOURCE> --who --why [values] [--not-a-client]` — ONE LIVE LOOKUP, ONLY INSIDE THE FIVE CONDITIONS.
 * Every refusal comes before the call and writes nothing. A lookup that is made is logged, PASS or NO, whatever
 * happens to it.
 */
export async function runSmokeCommand(argv: readonly string[], env: Record<string, string | undefined>, d: SmokeCommandDeps): Promise<number> {
  const source_id = (argv[0] ?? '').toUpperCase();
  if (source_id === '' || source_id.startsWith('--') || !isTestLookupSource(source_id)) {
    d.err(SMOKE_USAGE);
    d.err(`sources: ${TEST_LOOKUP_SOURCES.join(', ')}`);
    return 1;
  }

  // Condition 5, on every run, before anything else.
  d.out(NOT_A_DEMONSTRATION);
  d.out('Lakhbir allowed test lookups on 25 September 2026 on five conditions, and this command applies all five:');
  for (const c of TEST_LOOKUP_CONDITIONS) d.out(`  ${c}`);
  d.out('');

  if (env.CAPREBATE_LIVE_SMOKE !== '1') {
    d.err('refusing to make a live call: set CAPREBATE_LIVE_SMOKE=1 to confirm you mean to contact the service.');
    return 1;
  }
  const ww = whoAndWhy(argv);
  if (typeof ww === 'string') { d.err(ww); return 1; }

  const log = readTestLookupLog(env, d.repoRoot ?? repositoryRoot());
  if (!log.ok) { d.err(`refused: ${log.why}`); return 1; }
  const count = lookupsSinceSwitchOn(log.lines, source_id);
  if (!count.switched_on) {
    d.err(`refused: ${source_id} has no "switched on" line in the log, so its ${TEST_LOOKUPS_PER_SWITCH_ON} test lookups have not started. The person who switched it on records it first:`);
    d.err(`  node src/cli.ts smoke-switched-on ${source_id} --who "<name>" --why "<reason>"`);
    return 1;
  }
  if (count.used >= TEST_LOOKUPS_PER_SWITCH_ON) {
    d.err(`refused: ${source_id} has had ${count.used} of ${TEST_LOOKUPS_PER_SWITCH_ON} test lookups since it was switched on at ${count.since.at} by ${count.since.who}. A fourth is not allowed until it is switched on again and that is recorded with smoke-switched-on.`);
    return 1;
  }

  /* THE VALUES AND THE CALL are the only things that differ between a register and the land boundary. Everything
     above this line, and the log line below, is the same code for both. */
  const not_a_client = argv.includes('--not-a-client');
  let ask: string;
  let call: (audit: AuditLog) => Promise<'PASS' | 'NO'>;
  if (source_id === OS_TEST_SOURCE) {
    /* PHASE 156a: ONE square of map round the public test point (70 Whitehall, Historic England's grid reference, the
       same point the land boundary test uses). No point, postcode or address may be typed, so no client's can be. */
    if (['easting', 'northing', 'postcode', 'address', 'council'].some((f) => flag(argv, f) !== null)) {
      d.err('refused: the Ordnance Survey test looks only at the public test point (70 Whitehall); it takes no point, postcode or address.');
      return 1;
    }
    const key = (d.secrets.forOwner('OS_MAPS').get('OS_DATA_HUB_API_KEY') ?? '').trim();
    if (key === '') { d.err('refused: no OS_DATA_HUB_API_KEY in the key file, so there is nothing to test. Add it there first (the same key as in Vercel).'); return 1; }
    const at = { easting: BOUNDARY_TEST_DEFAULTS.easting, northing: BOUNDARY_TEST_DEFAULTS.northing };
    ask = `asking Ordnance Survey for the building outlines round the public test point (${BOUNDARY_TEST_DEFAULTS.source}).\n`;
    call = async (audit) => {
      const got = await buildingsAround({ audit, now: d.now, transport: d.transport, ...(d.sleep === undefined ? {} : { sleep: d.sleep }) }, key, at,
        { id: '(a test lookup)', role: 'test', gate: { free_gate_open: false, engagement_signed: false, switched_on: true } });
      const result = got.ok ? 'PASS' : 'NO';
      d.out(`${result}  ${OS_TEST_SOURCE} (free)`);
      d.out(got.ok ? `  Ordnance Survey took our call and sent ${got.value.length} building outline${got.value.length === 1 ? '' : 's'}.` : `  ${got.why}`);
      d.out('\nA PASS means the key and the OS Features API on its project are right. Nothing was kept.');
      return result;
    };
  } else if (source_id === BOUNDARY_TEST_SOURCE) {
    const bv = boundaryValuesFrom(argv);
    if (typeof bv === 'string') { d.err(`refused: ${bv}.`); return 1; }
    const client = clientCheck(env, (db) => boundaryClientMatchIn(db, bv), notTheBoundaryDefaults(bv), not_a_client);
    if (!client.ok) { d.err(`refused: never a client’s property — ${client.why}.`); return 1; }
    const isDefault = notTheBoundaryDefaults(bv).length === 0;
    ask = `downloading ${bv.council}'s land boundary file and looking in it for ${isDefault ? `the public test point (${BOUNDARY_TEST_DEFAULTS.source})` : 'the point you typed'}.\n` +
      'Only the council\'s name leaves this computer; the point stays here, and the file and the polygon are thrown away after the run.\n';
    call = async (audit) => {
      const r = await boundaryTestOne(bv, { audit, now: d.now, transport: d.transport, ...(d.sleep === undefined ? {} : { sleep: d.sleep }) });
      const result = r.accepted ? 'PASS' : 'NO';
      d.out(`${result}  ${BOUNDARY_TEST_SOURCE} (free, a file)`);
      d.out(`  ${r.why}.`);
      d.out(`  stage reached: ${r.stage}`);
      d.out('\nA PASS means the file downloaded, every polygon in it was read (so its shape is one our reader reads), and the');
      d.out('polygon holding the point was found. It says nothing more: nothing was kept and no site area was worked out.');
      return result;
    };
  } else {
    const values: SmokeValues = {
      company_number: flag(argv, 'company-number') ?? SMOKE_DEFAULTS.company_number,
      company_name: flag(argv, 'company-name') ?? SMOKE_DEFAULTS.company_name,
      address_line_1: flag(argv, 'address') ?? SMOKE_DEFAULTS.address_line_1,
      town: flag(argv, 'town') ?? SMOKE_DEFAULTS.town,
      postcode: flag(argv, 'postcode') ?? SMOKE_DEFAULTS.postcode,
    };
    // PHASE 156a: the person running it may say which part of the UK the address is in. Never assumed.
    const nationSaid = flag(argv, 'nation');
    if (nationSaid !== null) {
      const n = nationSaid.trim().toLowerCase();
      if (!SMOKE_NATIONS.includes(n)) { d.err('refused: --nation must be england, wales, scotland or northern_ireland.'); return 1; }
      values.nation = n as Nation;
    }
    const councilSaid = flag(argv, 'council');
    if (councilSaid !== null && councilSaid.trim() !== '') values.council = councilSaid.trim().slice(0, 100);
    const client = clientCheck(env, (db) => clientMatchIn(db, values), notTheDefaults(values), not_a_client);
    if (!client.ok) { d.err(`refused: never a client’s property — ${client.why}.`); return 1; }
    ask = `asking ${source_id} about ${values.company_name} (${values.company_number}), ${values.postcode}\n`;
    call = async (audit) => {
      const r = await smokeOne(source_id, values, {
        audit, now: d.now, transport: d.transport, secrets: d.secrets,
        ...(d.postcodeStore === undefined ? {} : { postcodeStore: d.postcodeStore }),
        ...(d.sleep === undefined ? {} : { sleep: d.sleep }),
      });
      const result = r.accepted ? 'PASS' : 'NO';
      d.out(`${result}  ${r.source_id} (${r.tier})`);
      d.out(`  ${r.accepted ? 'the service took our call' : 'the service did not take our call'}: ${r.why}`);
      d.out(`  lookup: ${r.outcome}${r.call === null ? '  (no call was made)' : `  call: ${r.call.outcome}${r.call.status === null ? '' : ` ${r.call.status}`} after ${r.call.attempts} ${r.call.attempts === 1 ? 'try' : 'tries'}`}`);
      if (r.call === null && values.nation == null && /which part of the UK/.test(r.why)) {
        d.out('  With no postcode table here, say the nation yourself: add --nation england (70 Whitehall is in England).');
      }
      if (r.call === null && values.council == null && /council area/.test(r.why)) {
        d.out('  With no postcode table here, say the council area yourself: add --council Westminster (70 Whitehall is in Westminster).');
      }
      if (r.cost_pence !== null && r.cost_pence > 0) d.out(`  it cost ${r.cost_pence}p`);
      d.out('\nA PASS means the address, the key and the account are right. It does NOT mean the register holds');
      d.out('anything about what you asked: "nothing matched" is still a pass.');
      return result;
    };
  }

  const cannot = writable(log.path);
  if (cannot !== null) { d.err(`refused: ${cannot}`); return 1; }

  d.out(`test lookup ${count.used + 1} of ${TEST_LOOKUPS_PER_SWITCH_ON} for ${source_id} since it was switched on at ${count.since.at}`);
  d.out(ask);

  // An audit log of its own, in memory: the call writes its row like any other and the answer is thrown away with it.
  const db = new Db(':memory:');
  let result: 'PASS' | 'NO' = 'NO';
  try {
    migrate(db, MIGRATIONS_DIR);
    result = await call(new AuditLog(db));
  } finally {
    db.close();
    append(log.path, lookupLine(source_id, d.now(), result, ww.who, ww.why, not_a_client));
    d.out(`\nLogged ${result} for ${source_id} in ${log.path} (the connector, the time, the result, who and why; nothing asked and nothing answered).`);
  }
  return result === 'PASS' ? 0 : 1;
}
