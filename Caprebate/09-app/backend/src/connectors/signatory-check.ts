/**
 * WHO SIGNED, AND WHETHER THE PUBLIC REGISTER SAYS THEY MAY SIGN — CHECKED IN MEMORY, KEPT AS YES OR NO.
 * Phase 151b, 25 September 2026. Switched off WITH THE LOOKUPS: no switch of its own.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE DECISION
 *
 * Word question 156, for the data protection officer: "May we briefly check two public register names without saving
 * them?" The background: we want to know that the person who signed the engagement letter really represents the
 * business, and two free public sources can say — the Companies House officers list, and the care regulator's (CQC's)
 * named people, the registered manager and the nominated individual. The suggestion was to read only the names,
 * compare them in memory and throw them away, keeping a yes or no and the source; never to store an officer's name;
 * to record "not found" as just that, never as a risk; and never to show it to the client.
 *
 * ANSWER, closed 24 September 2026: "Yes – best to check who signs and if they have authority". The action plan:
 * "check who signs and whether they have authority against the public register, reading names in memory and keeping
 * only yes or no; switched off with the lookups."
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES
 *
 * `checkSignatory` takes the name the signer typed on the engagement letter (engagement_signatures.signer_name,
 * migration 040 — read by src/web/research.ts on the server, never from a form), the client's company number and care
 * regulator ids that we already hold, and the client's claimant type. For each of the two registers it gives:
 *
 *   YES          the register names them in a role that can sign: a CURRENT director (or an LLP's designated
 *                member) at Companies House; the registered manager or the nominated individual at CQC.
 *   NO           the register answered and does not name them so: not listed, listed only as having left, or
 *                listed in a role that cannot sign (a secretary, an ordinary LLP member). NOT A RISK AND NOT A
 *                WARNING: it is what the register shows, and the words say so and nothing more.
 *   NOT_CHECKED  with a reason code: switched off, free lookups not open, the letter not signed, no key, no name, no
 *                company number or care registration, a sole trader or partnership (the register does not apply),
 *                the register did not answer, could not be read, or listed too many people to read.
 *
 * NAMES NEVER LEAVE: the signer's name is held in the closure of `signerTest` and nowhere else; the register's names
 * are read inside the connectors (src/connectors/companies-house.ts `companiesHouseOfficers`, src/connectors/cqc.ts
 * `cqcNamedPeople`) and dropped there. The outcome carries a source, a result, a reason CODE and the words for it. No
 * name is in the outcome, the stored row (migration 050 has no name column, and its reason is a closed list of codes),
 * the audit row (SIGNATORY_CHECKED: source and result), a log line or an error. Nothing here throws, and nothing
 * here writes: src/web/research.ts stores the outcome.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE GATES AND THE SWITCHES — THE LOOKUPS' OWN, NOT NEW ONES
 *
 * Both registers are free, so the check waits on the free gate (CB_REGISTRY.precondition, read by research.ts's
 * `freeGate` and passed in here). It also waits on the signed engagement, asserted server-side by
 * `assertSignedEngagement`, because until the letter is signed there is no signer to check. Then the SOURCE'S OWN
 * SWITCH: Companies House's is CH_COMPANY, the care regulator's is CQC (REGISTER_SWITCHES, both false). Then the key.
 * Each is checked through `runConnector`, the same path every lookup takes, so a call is made only after all four.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * HOW TWO NAMES ARE COMPARED — `sameName`
 *
 * matching.ts scores addresses and company names; a person's name needs a stricter rule, so it is written here and
 * tested. Both names are put in capitals, accents dropped, full stops and apostrophes removed, and titles (Dr, Mr, Mrs,
 * Prof …) and letters after a name (OBE, Jr, PhD …) dropped. Companies House writes "SURNAME, Forenames"; a name with
 * a comma is read that way round. A name with no comma is tried at every split, so an unhyphenated double surname
 * still matches. A hyphen inside a surname is ignored ("Smith-Jones" = "Smith Jones"). Then:
 *   · the surnames must be the same;
 *   · the FIRST forename must be the same, in full — an initial alone is never enough;
 *   · middle names are optional on either side, but where both give them they must agree, in order, in full or as an
 *     initial ("Joseph A" matches "Joseph Andrew"; "Joseph Brian" does not).
 * Anything short of that is not the same name. A false NO costs a person a look; a false YES would be a check that
 * lied, so the rule leans to NO. Nicknames are not guessed.
 */

import type { SecretStore } from '../secrets.ts';
import type { CallDeps } from './http.ts';
import { runConnector, switchedOn, REGISTER_SWITCHES, type ConnectorContext, type RegisterConnector } from './registers.ts';
import { companiesHouseOfficers, companyNumberOf, type OfficersQuery } from './companies-house.ts';
import { cqcNamedPeople, type CqcPeopleQuery } from './cqc.ts';

/* ================================================================== *
 * 1 · THE VOCABULARY
 * ================================================================== */

export type SignatorySource = 'COMPANIES_HOUSE' | 'CQC';
export const SIGNATORY_SOURCES: readonly SignatorySource[] = Object.freeze(['COMPANIES_HOUSE', 'CQC']);
export type SignatoryResult = 'YES' | 'NO' | 'NOT_CHECKED';

/** The source register's id each check runs under — whose switch and key it uses. */
export const SIGNATORY_SWITCH_OF: Readonly<Record<SignatorySource, string>> = Object.freeze({ COMPANIES_HOUSE: 'CH_COMPANY', CQC: 'CQC' });

export const YES_REASONS = ['CURRENT_DIRECTOR', 'DESIGNATED_MEMBER', 'REGISTERED_MANAGER', 'NOMINATED_INDIVIDUAL'] as const;
export const NO_REASONS = ['NOT_LISTED', 'RESIGNED', 'ROLE_CANNOT_SIGN'] as const;
/** Kept in the table: the check was allowed and switched on, and could not reach a yes or no. */
export const NOT_CHECKED_KEPT = [
  'NO_SIGNER_NAME', 'NO_COMPANY_NUMBER', 'NO_CARE_REGISTRATION', 'NOT_ON_THIS_REGISTER', 'NO_RECORD_ON_REGISTER',
  'REGISTER_DID_NOT_ANSWER', 'REGISTER_UNREADABLE', 'TOO_MANY_TO_READ',
] as const;
/** Never kept: nothing happened, and the panel works these out afresh each time it is drawn. */
export const NOT_CHECKED_LIVE = ['FREE_LOOKUPS_OFF', 'NOT_SIGNED', 'SWITCHED_OFF', 'NO_KEY', 'NOT_RUN_YET'] as const;

export type SignatoryReason =
  | typeof YES_REASONS[number] | typeof NO_REASONS[number] | typeof NOT_CHECKED_KEPT[number] | typeof NOT_CHECKED_LIVE[number];

export function resultOf(reason: SignatoryReason): SignatoryResult {
  if ((YES_REASONS as readonly string[]).includes(reason)) return 'YES';
  if ((NO_REASONS as readonly string[]).includes(reason)) return 'NO';
  return 'NOT_CHECKED';
}

/** Whether an outcome with this reason is written to signatory_checks. */
export function keptReason(reason: SignatoryReason): boolean {
  return !(NOT_CHECKED_LIVE as readonly string[]).includes(reason);
}

/* ================================================================== *
 * 2 · THE WORDS — one line on the research panel for each outcome. Staff only; the client never sees them.
 * ================================================================== */

const REGISTER_WORDS: Readonly<Record<SignatorySource, string>> = Object.freeze({ COMPANIES_HOUSE: 'Companies House', CQC: 'The care regulator' });
const LOOKUP_WORDS: Readonly<Record<SignatorySource, string>> = Object.freeze({ COMPANIES_HOUSE: 'the Companies House lookup', CQC: 'the care regulator lookup' });

export function signatoryWords(source: SignatorySource, reason: SignatoryReason): string {
  const reg = REGISTER_WORDS[source];
  switch (reason) {
    case 'CURRENT_DIRECTOR': return 'Yes. Companies House lists the person who signed as a current director.';
    case 'DESIGNATED_MEMBER': return 'Yes. Companies House lists the person who signed as a designated member of the LLP.';
    case 'REGISTERED_MANAGER': return 'Yes. The care regulator lists the person who signed as the registered manager.';
    case 'NOMINATED_INDIVIDUAL': return 'Yes. The care regulator names the person who signed as the lead person for the provider.';
    case 'NOT_LISTED': return source === 'CQC'
      ? 'No. The care regulator does not name the person who signed as the manager or the lead person. This is only what the register shows.'
      : 'No. Companies House does not list the person who signed as a current director. This is only what the register shows.';
    case 'RESIGNED': return 'No. Companies House lists the person who signed only as a director who has left. This is only what the register shows.';
    case 'ROLE_CANNOT_SIGN': return 'No. Companies House lists the person who signed, but not as a director. This is only what the register shows.';
    case 'NO_SIGNER_NAME': return 'Not checked. The signed letter has no name we can read.';
    case 'NO_COMPANY_NUMBER': return 'Not checked. We hold no company number for this client.';
    case 'NO_CARE_REGISTRATION': return 'Not checked. We hold no care regulator number for this client.';
    case 'NOT_ON_THIS_REGISTER': return source === 'CQC'
      ? 'Not checked. The care regulator names a lead person only for a firm. A sole trader or a partnership has none.'
      : 'Not checked. A sole trader or a partnership has no directors on this register.';
    case 'NO_RECORD_ON_REGISTER': return `Not checked. ${reg} holds no record under the number we hold.`;
    case 'REGISTER_DID_NOT_ANSWER': return `Not checked. ${reg} did not answer this time. We try again on the next run.`;
    case 'REGISTER_UNREADABLE': return `Not checked. ${reg} answered, but not in a form we could read.`;
    case 'TOO_MANY_TO_READ': return `Not checked. ${reg} lists more people than we read in one go, so a person should look.`;
    case 'FREE_LOOKUPS_OFF': return 'Not checked. Free lookups wait until our privacy notice is published.';
    case 'NOT_SIGNED': return 'Not checked. We check only once the engagement letter is signed.';
    case 'SWITCHED_OFF': return `Not checked. It runs with ${LOOKUP_WORDS[source]}, which is not switched on yet.`;
    case 'NO_KEY': return `Not checked. ${REGISTER_WORDS[source]} is switched on, but its key is not set up yet.`;
    case 'NOT_RUN_YET': return 'Not checked yet. It runs when you press “Run the research”.';
  }
}

/* ================================================================== *
 * 3 · COMPARING TWO PERSON NAMES, IN MEMORY
 * ================================================================== */

/** A name as a register gives it: the whole string ("SURNAME, Forenames"), or its parts, or both. */
export type RegisterPersonName = { readonly whole: string | null; readonly surname: string | null; readonly forenames: string | null };
/** The one question a connector asks of each name it reads. It answers true or false and keeps nothing. */
export type SignerTest = (name: RegisterPersonName) => boolean;

type Parsed = { readonly surname: string; readonly forenames: readonly string[] };

const TITLES = new Set(['MR', 'MRS', 'MS', 'MISS', 'MX', 'DR', 'DOCTOR', 'PROF', 'PROFESSOR', 'SIR', 'DAME', 'LADY', 'LORD',
  'REV', 'REVD', 'REVEREND', 'FR', 'HON', 'CAPT', 'CAPTAIN']);
const AFTER_NAME = new Set(['JR', 'JNR', 'JUNIOR', 'SR', 'SNR', 'SENIOR', 'II', 'III', 'IV', 'OBE', 'MBE', 'CBE', 'KBE', 'DBE',
  'KC', 'QC', 'PHD', 'MD', 'MBBS', 'FRCS', 'FRCP', 'ESQ']);

/** Capitals, no accents, no full stops or apostrophes; each word kept, a hyphen inside a word kept for now. */
function words(raw: string): string[] {
  return raw.normalize('NFKD').replace(/\p{M}/gu, '').toUpperCase()
    .replace(/['’‘`]/g, '').replace(/[^A-Z\s-]/g, ' ')
    .split(/\s+/).map((w) => w.replace(/^-+|-+$/g, '')).filter((w) => w !== '' && !TITLES.has(w) && !AFTER_NAME.has(w));
}
const key = (ws: readonly string[]): string => ws.join('').replace(/-/g, '');

/** Every reading of a name: one where it says which part is the surname, one per split where it does not. */
export function readingsOf(n: RegisterPersonName | string | null | undefined): Parsed[] {
  if (n === null || n === undefined) return [];
  const r: RegisterPersonName = typeof n === 'string' ? { whole: n, surname: null, forenames: null } : n;
  const out: Parsed[] = [];
  const fromParts = (sur: string, fore: string): void => {
    const s = key(words(sur));
    const f = words(fore).flatMap((w) => w.split('-')).filter((w) => w !== '');
    if (s !== '' && f.length > 0) out.push({ surname: s, forenames: f });
  };
  if (r.surname !== null && r.forenames !== null) fromParts(r.surname, r.forenames);
  if (r.whole !== null) {
    const comma = r.whole.indexOf(',');
    if (comma >= 0) fromParts(r.whole.slice(0, comma), r.whole.slice(comma + 1));
    else {
      const ws = words(r.whole);
      for (let k = 1; k < ws.length; k++) fromParts(ws.slice(ws.length - k).join(' '), ws.slice(0, ws.length - k).join(' '));
    }
  }
  return out;
}

const initialOf = (a: string, b: string): boolean => (a.length === 1 && b.startsWith(a)) || (b.length === 1 && a.startsWith(b));

function middlesAgree(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0 || b.length === 0) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  let j = 0;
  for (const w of short) {
    while (j < long.length && !(long[j] === w || initialOf(w, long[j] as string))) j++;
    if (j === long.length) return false;
    j++;
  }
  return true;
}

function agree(a: Parsed, b: Parsed): boolean {
  const [fa, ...ma] = a.forenames;
  const [fb, ...mb] = b.forenames;
  if (a.surname !== b.surname || fa === undefined || fb === undefined) return false;
  // The first forename in full on both sides. An initial alone is never enough.
  if (fa.length < 2 || fb.length < 2 || fa !== fb) return false;
  return middlesAgree(ma, mb);
}

/** True only when the two names are the same person's name by the rule in the header. Never throws. */
export function sameName(signed: string | null | undefined, register: RegisterPersonName | string | null | undefined): boolean {
  try {
    const xs = readingsOf(signed ?? null);
    const ys = readingsOf(register);
    return xs.some((x) => ys.some((y) => agree(x, y)));
  } catch { return false; }
}

/** The test a connector is handed. The signer's name lives in this closure and nowhere else. */
export function signerTest(signed: string): SignerTest {
  return (n) => sameName(signed, n);
}

/* ================================================================== *
 * 4 · THE CHECK
 * ================================================================== */

export type SignatoryInput = {
  /** As typed on the signed engagement letter. Held in memory for this call only. */
  readonly signer_name: string | null;
  /** businesses.claimant_type or the assessment's answer; null when not known. */
  readonly claimant_type: string | null;
  readonly company_number: string | null;
  readonly cqc_location_id: string | null;
  readonly cqc_provider_id: string | null;
};

export type SignatoryGates = { readonly free_gate_open: boolean; readonly engagement_signed: boolean };

export type SignatoryOutcome = {
  readonly source: SignatorySource;
  readonly result: SignatoryResult;
  readonly reason: SignatoryReason;
  readonly words: string;
  /** False when nothing happened (off, not allowed, no key): such an outcome is shown, never stored. */
  readonly kept: boolean;
  readonly cost_pence: number;
};

/** A sole trader, a partnership or an individual: neither register names its people in a role that signs. */
const NOT_ON_REGISTER: readonly string[] = ['SOLE_TRADER', 'PARTNERSHIP', 'INDIVIDUAL'];

export function outcome(source: SignatorySource, reason: SignatoryReason, cost_pence = 0): SignatoryOutcome {
  return { source, result: resultOf(reason), reason, words: signatoryWords(source, reason), kept: keptReason(reason), cost_pence };
}

/**
 * WHY THIS SOURCE WOULD NOT RUN, before anything else is looked at — or null when it may. The panel asks this too,
 * with no key file (it cannot see one), so the same order is shown before and after a click. Only `true` opens
 * anything (N4): a gate or a signature given as anything else is shut.
 */
export function notYet(
  source: SignatorySource, gates: SignatoryGates, switches: Readonly<Record<string, boolean>> = REGISTER_SWITCHES,
  secrets: SecretStore | null = null,
): SignatoryReason | null {
  if (gates.free_gate_open !== true) return 'FREE_LOOKUPS_OFF';
  if (gates.engagement_signed !== true) return 'NOT_SIGNED';
  const c = connectorFor(source);
  if (!switchedOn(c.source_id, switches)) return 'SWITCHED_OFF';
  if (secrets !== null && c.configured(secrets, switches).state !== 'READY') return 'NO_KEY';
  return null;
}

function connectorFor(source: SignatorySource): RegisterConnector<OfficersQuery> | RegisterConnector<CqcPeopleQuery> {
  return source === 'COMPANIES_HOUSE' ? companiesHouseOfficers : cqcNamedPeople;
}

const blank = (v: string | null | undefined): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/** A run that was allowed and came back: its facts, or why it stopped, as a reason code. */
function reasonFromRun(run: Awaited<ReturnType<typeof runConnector>>): SignatoryReason {
  if (run.state === 'FIRED' && run.bundle !== null) {
    const r = run.bundle.facts['signatory_reason'];
    const all = [...YES_REASONS, ...NO_REASONS] as readonly string[];
    return typeof r === 'string' && all.includes(r) ? r as SignatoryReason : 'REGISTER_UNREADABLE';
  }
  switch (run.failure_code) {
    case 'NO_MATCH': return 'NO_RECORD_ON_REGISTER';
    case 'MATCH_REVIEW': return 'TOO_MANY_TO_READ';
    case 'UNREADABLE': return 'REGISTER_UNREADABLE';
    case 'INSUFFICIENT_INPUT': return 'NO_RECORD_ON_REGISTER';
    default: return 'REGISTER_DID_NOT_ANSWER';
  }
}

/**
 * CHECK BOTH REGISTERS. Returns one outcome per source, in SIGNATORY_SOURCES's order, and nothing else — no name.
 * `ctx` is the research run's: the calls go through `callOutside`, one audit row each, with the gates as they stood.
 */
export async function checkSignatory(
  ctx: { readonly deps: CallDeps; readonly actor_id: string | null; readonly actor_role?: string | null; readonly claim_id: string | null },
  input: SignatoryInput, gates: SignatoryGates, secrets: SecretStore,
  switches: Readonly<Record<string, boolean>> = REGISTER_SWITCHES,
  only: readonly SignatorySource[] = SIGNATORY_SOURCES,
): Promise<SignatoryOutcome[]> {
  const out: SignatoryOutcome[] = [];
  for (const source of SIGNATORY_SOURCES.filter((s) => only.includes(s))) {
    const stop = notYet(source, gates, switches, secrets);
    if (stop !== null) { out.push(outcome(source, stop)); continue; }
    const signed = blank(input.signer_name);
    if (signed === null || readingsOf(signed).length === 0) { out.push(outcome(source, 'NO_SIGNER_NAME')); continue; }
    if (NOT_ON_REGISTER.includes(input.claimant_type ?? '')) { out.push(outcome(source, 'NOT_ON_THIS_REGISTER')); continue; }
    const c = connectorFor(source);
    const full: ConnectorContext = {
      ...ctx, secrets: null,
      gate: { free_gate_open: gates.free_gate_open, engagement_signed: gates.engagement_signed, switched_on: switchedOn(c.source_id, switches) },
    };
    const test = signerTest(signed);
    let run;
    if (source === 'COMPANIES_HOUSE') {
      const number = companyNumberOf(blank(input.company_number));
      if (number === null) { out.push(outcome(source, 'NO_COMPANY_NUMBER')); continue; }
      run = await runConnector(companiesHouseOfficers, full, { company_number: number, isSigner: test }, { state: 'NOT_RUN', detail: '' }, secrets, switches);
    } else {
      const location_id = blank(input.cqc_location_id);
      const provider_id = blank(input.cqc_provider_id);
      if (location_id === null && provider_id === null) { out.push(outcome(source, 'NO_CARE_REGISTRATION')); continue; }
      run = await runConnector(cqcNamedPeople, full, { location_id, provider_id, isSigner: test }, { state: 'NOT_RUN', detail: '' }, secrets, switches);
    }
    // Only the reason code and the cost leave the run: its calls and their answers go out of scope here.
    out.push(outcome(source, reasonFromRun(run), run.cost_pence));
  }
  return out;
}
