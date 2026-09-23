/**
 * THE 200-PROPERTY MATCHING MEASUREMENT — the S10 Address Matching Spec's test (A.4, and A.8 point 10 for the energy
 * certificate register), built by Phase 146c on 23 September 2026 and NOT RUN.
 *
 * WHY IT EXISTS. Every free register is matched to a typed address at 0.90 / 0.70 (MATCH_THRESHOLDS in
 * src/connectors/matching.ts). Those numbers are the spec's guesses, and standing rule 13 says in terms: do not assert
 * that the typed-address match is good enough, and do not assert that it is not — measure it. This is the measurement.
 *
 * IT WAITS ON THE DATA PROTECTION OFFICER. It looks up 200 REAL addresses — the spec says drawn from our own client and
 * prospect list — in live registers. `MEASUREMENT_PERMISSION` below is false until the officer answers the Word
 * question "May we run our address-matching test on 200 real addresses?", and `--run` refuses until it is true.
 *
 *   node tools/match-measure.ts --plan                      what it would do, and why it will not yet
 *   node tools/match-measure.ts --run <sample.csv> --out <results.csv> --db <audit.sqlite>
 *                                                           LIVE. Refused until the permission is recorded.
 *   node tools/match-measure.ts --score <truthed.csv>       the metrics, and the thresholds they support. No network.
 *   node tools/match-measure.ts --self-test                 the refusals and the arithmetic, on planted rows
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE THREE STEPS (A.4)
 *
 *   1. SAMPLE — a CSV the person running it provides: id, sector, address_line_1, address_line_2, town, postcode,
 *      nation. 200 rows, 40 per sector. It is personal-adjacent data (our clients' addresses), so every file this tool
 *      reads or writes must be OUTSIDE the repository — the same test the key file passes (src/secrets.ts).
 *   2. RUN — each address against each register this build can match: the care regulator (England), energy
 *      certificates (non-domestic and display; domestic too for supported living), HM Land Registry sale prices
 *      (supported living only) and planning. Through the real connectors and the one way out (src/connectors/http.ts),
 *      every call on the audit chain in the database named by --db. The switches are NOT turned on: the tool calls each
 *      connector's lookup directly, which is exactly what this permission is for, and the research flow is untouched.
 *      One output row per (address × register): the band, the top score, how many were scored, and the top candidate's
 *      address as the register wrote it, with two empty columns — `truth_exists` and `truth_top_correct` — for a person.
 *   3. SCORE — once a person has filled those two columns (Y or N), per register: precision of ACCEPTs, recall, the
 *      FALSE-ACCEPT RATE (accepted but wrong — the binding constraint, at most 1%), the REVIEW rate and the true-negative
 *      rate; and the lowest accept threshold, AT OR ABOVE TODAY'S, at which the false-accept rate is 1% or less.
 *      Thresholds move UP, never down (A.4 point 5). The result is written into MATCH_THRESHOLDS by a person, and
 *      THRESHOLDS_MEASURED set true — this tool changes no code.
 *
 * NOT MEASURED HERE, AND SAID SO: the valuation office and the HM Land Registry title register, which the spec lists
 * and this build has no connector for; and Companies House, which is matched on a name, not an address.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildApp } from '../src/app.ts';
import { loadSecrets, repositoryRoot, isInside, type SecretStore } from '../src/secrets.ts';
import { liveTransport, fixtureTransport, type Transport } from '../src/connectors/http.ts';
import type { ConnectorContext, RegisterConnector } from '../src/connectors/registers.ts';
import { MATCH_THRESHOLDS, type MatchProfile, type MeasureHook, type RawAddress } from '../src/connectors/matching.ts';
import { cqc } from '../src/connectors/cqc.ts';
import { epc } from '../src/connectors/epc.ts';
import { pricePaid } from '../src/connectors/price-paid.ts';
import { planning } from '../src/connectors/planning.ts';
import type { Nation, TypedProperty } from '../src/connectors/nations.ts';
import { resolveProperty, postcodeStore } from '../src/web/postcode.ts';

/* ================================================================== *
 * THE PERMISSION — one line, and it is the data protection officer's
 * ================================================================== */

export const MEASUREMENT_PERMISSION = Object.freeze({
  allowed: false,
  question: 'May we run our address-matching test on 200 real addresses?',
  where: 'the Word questions document, under the data protection officer',
  recorded_answer: null as string | null,
});

export const SAMPLE_COLUMNS = ['id', 'sector', 'address_line_1', 'address_line_2', 'town', 'postcode', 'nation'] as const;
export const RESULT_COLUMNS = ['id', 'sector', 'register', 'status', 'top_score', 'scored', 'top_address', 'truth_exists', 'truth_top_correct'] as const;
/** The binding bar (A.4 point 5): at most 1% of ACCEPTs wrong, per register. */
export const FALSE_ACCEPT_BAR = 0.01;
/** The secondary target: at least 90% of true matches accepted. Reported, never traded against the bar. */
export const RECALL_TARGET = 0.90;

/* ================================================================== *
 * CSV — quoted fields, doubled quotes, commas and line breaks inside quotes
 * ================================================================== */

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c !== '')) rows.push(row);
  const [head, ...body] = rows;
  if (head === undefined) return [];
  return body.map((r) => Object.fromEntries(head.map((h, n) => [h.trim(), (r[n] ?? '').trim()])));
}

export function toCsv(cols: readonly string[], rows: readonly Record<string, string | number | null>[]): string {
  const cell = (v: string | number | null): string => {
    const s = v === null ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c] ?? null)).join(','))].join('\n') + '\n';
}

/* ================================================================== *
 * SCORING — the metrics of A.4 point 4, and the threshold they support
 * ================================================================== */

export type RegisterMetrics = {
  readonly register: string;
  readonly pairs: number;
  readonly judged: number;
  readonly accepts: number;
  readonly false_accepts: number;
  readonly precision: number | null;
  readonly false_accept_rate: number | null;
  readonly recall: number | null;
  readonly review_rate: number | null;
  readonly true_negative_rate: number | null;
  readonly current_accept: number;
  /** The lowest accept threshold at or above today's with false accepts at or under the bar; null if none. */
  readonly supported_accept: number | null;
  readonly meets_bar_today: boolean | null;
};

const yes = (v: string | undefined): boolean | null => {
  const t = (v ?? '').trim().toUpperCase();
  return t === 'Y' || t === 'YES' ? true : t === 'N' || t === 'NO' ? false : null;
};

function profileOf(register: string): MatchProfile | null {
  const base = register.split(':')[0] ?? '';
  return base === 'EPC' || base === 'CQC' || base === 'HMLR_PPD' || base === 'PLANNING' ? base : null;
}

export function scoreRows(rows: readonly Record<string, string>[]): RegisterMetrics[] {
  const by = new Map<string, Record<string, string>[]>();
  for (const r of rows) by.set(r['register'] ?? '', [...(by.get(r['register'] ?? '') ?? []), r]);
  const rate = (a: number, b: number): number | null => (b === 0 ? null : a / b);
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([register, rs]) => {
    const profile = profileOf(register);
    const current = profile === null ? 0.90 : MATCH_THRESHOLDS[profile].accept;
    // Only rows a person has judged count: an unjudged row is not a pass and not a fail (N4).
    const judged = rs.filter((r) => yes(r['truth_exists']) !== null);
    const exists = judged.filter((r) => yes(r['truth_exists']) === true);
    const absent = judged.filter((r) => yes(r['truth_exists']) === false);
    const correct = (r: Record<string, string>): boolean => yes(r['truth_exists']) === true && yes(r['truth_top_correct']) === true;
    const accepts = judged.filter((r) => r['status'] === 'ACCEPT');
    const wrong = accepts.filter((r) => !correct(r));
    const score = (r: Record<string, string>): number => Number(r['top_score'] || 'NaN');
    // The threshold: the lowest t at or above today's, in steps of 0.01, at which the rows whose top score reaches t
    // (and so would be accepted) are at most 1% wrong. A tie is REVIEW whatever its score, so tied rows never count.
    let supported: number | null = null;
    for (let t = Math.round(current * 100); t <= 100; t++) {
      const at = judged.filter((r) => r['status'] !== 'REVIEW_TIE' && Number.isFinite(score(r)) && score(r) >= t / 100 - 1e-9);
      const bad = at.filter((r) => !correct(r)).length;
      if (at.length === 0 || bad / at.length <= FALSE_ACCEPT_BAR) { supported = t / 100; break; }
    }
    const far = rate(wrong.length, accepts.length);
    return {
      register, pairs: rs.length, judged: judged.length, accepts: accepts.length, false_accepts: wrong.length,
      precision: rate(accepts.length - wrong.length, accepts.length),
      false_accept_rate: far,
      recall: rate(accepts.filter(correct).length, exists.length),
      review_rate: rate(judged.filter((r) => r['status'] === 'REVIEW' || r['status'] === 'REVIEW_TIE').length, judged.length),
      true_negative_rate: rate(absent.filter((r) => r['status'] === 'REJECT').length, absent.length),
      current_accept: current,
      supported_accept: supported,
      meets_bar_today: far === null ? null : far <= FALSE_ACCEPT_BAR,
    };
  });
}

/* ================================================================== *
 * THE RUN — live, and refused until the officer has said yes
 * ================================================================== */

export type RunRefusal = { readonly refused: true; readonly why: string };

export function refusalFor(opts: {
  readonly permission: { readonly allowed: boolean };
  readonly paths: readonly string[];
  readonly repoRoot: string;
  readonly secrets: SecretStore;
}): RunRefusal | null {
  if (!opts.permission.allowed) {
    return { refused: true, why: `not run: the data protection officer has not yet answered "${MEASUREMENT_PERMISSION.question}" (${MEASUREMENT_PERMISSION.where})` };
  }
  for (const p of opts.paths) {
    if (isInside(resolve(p), opts.repoRoot)) return { refused: true, why: `not run: ${p} is inside the code folder; real addresses never go there` };
  }
  const missing = ['CQC', 'EPC'].flatMap((o) => opts.secrets.forOwner(o as 'CQC' | 'EPC').missing());
  if (missing.length > 0) return { refused: true, why: `not run: the key file has no ${missing.join(' or ')}` };
  return null;
}

type Target = { readonly register: string; readonly connector: RegisterConnector<unknown>; readonly query: (m: MeasureHook) => unknown };

function targetsFor(row: Record<string, string>, council: string | null): Target[] {
  const property: TypedProperty = {
    id: row['id'] ?? '', address_line_1: row['address_line_1'] || null, address_line_2: row['address_line_2'] || null,
    town: row['town'] || null, postcode: row['postcode'] || null,
    jurisdiction: (['england', 'wales', 'scotland', 'northern_ireland'].includes(row['nation'] ?? '') ? row['nation'] : null) as Nation | null,
  };
  const nation = property.jurisdiction;
  const sector = row['sector'] || null;
  const t: Target[] = [
    { register: 'CQC', connector: cqc as RegisterConnector<unknown>, query: (measure) => ({ property, nation, sector, council, company_number: null, measure }) },
    { register: 'EPC', connector: epc as RegisterConnector<unknown>, query: (measure) => ({ property, nation, sector, measure }) },
    { register: 'PLANNING', connector: planning as RegisterConnector<unknown>, query: (measure) => ({ property, nation, measure }) },
  ];
  if (sector === 'supported_living') {
    t.push({ register: 'HMLR_PPD', connector: pricePaid as RegisterConnector<unknown>, query: (measure) => ({ property, nation, sector, measure }) });
  }
  return t;
}

function addressWords(a: RawAddress | null): string {
  if (a === null) return '';
  return [a.saon, a.paon, a.street, a.locality, a.town, a.postcode].filter((x) => x !== undefined && x !== '').join(', ');
}

export async function measure(opts: {
  readonly sample: readonly Record<string, string>[];
  readonly transport: Transport;
  readonly secrets: SecretStore;
  readonly dbPath: string;
  /** How long to leave between PlanIt calls: its owner's minute, and a second. 0 in the self-test. */
  readonly paceMs: number;
}): Promise<Record<string, string | number | null>[]> {
  const app = await buildApp({ location: opts.dbPath, secrets: opts.secrets, outside: opts.transport });
  const out: Record<string, string | number | null>[] = [];
  let lastPlanIt = 0;
  try {
    const store = postcodeStore();
    for (const row of opts.sample) {
      const council = store === null ? null : resolveProperty(row['postcode'] ?? null, { store }).authority?.lad_name ?? null;
      for (const target of targetsFor(row, council)) {
        const seen: Parameters<MeasureHook>[0][] = [];
        const ctx: ConnectorContext = {
          deps: { audit: app.audit, now: app.now, transport: opts.transport }, actor_id: null, actor_role: 'MEASUREMENT', claim_id: null,
          gate: { free_gate_open: false, engagement_signed: false, switched_on: false },
          secrets: target.connector.owner === null ? null : opts.secrets.forOwner(target.connector.owner),
        };
        let status = 'NOT_RUN';
        // PlanIt asks for one request a minute; a live run waits its turn rather than being refused by our own limit.
        if (target.register === 'PLANNING' && opts.paceMs > 0) {
          const wait = lastPlanIt + opts.paceMs - Date.now();
          if (wait > 0) await new Promise((r) => setTimeout(r, wait));
          lastPlanIt = Date.now();
        }
        try {
          const r = await target.connector.lookup(ctx, target.query((s) => { seen.push(s); }));
          status = r.kind === 'NOT_COVERED' ? 'NOT_COVERED' : r.kind === 'CALL_FAILED' || r.kind === 'UNREADABLE' ? 'MATCH_ERROR'
            : r.kind === 'NOT_MATCHED' ? r.code : 'READ';
        } catch { status = 'MATCH_ERROR'; }
        if (seen.length === 0) {
          out.push({ id: row['id'] ?? '', sector: row['sector'] ?? '', register: target.register, status, top_score: null, scored: 0, top_address: '', truth_exists: '', truth_top_correct: '' });
          continue;
        }
        for (const s of seen) {
          const tied = s.match.status === 'REVIEW' && s.match.top_score !== null && s.match.top_score >= MATCH_THRESHOLDS[s.profile].accept;
          out.push({
            id: row['id'] ?? '', sector: row['sector'] ?? '', register: s.register === undefined ? target.register : `${target.register}:${s.register}`,
            status: tied ? 'REVIEW_TIE' : s.match.status, top_score: s.match.top_score === null ? null : Number(s.match.top_score.toFixed(4)),
            scored: s.match.scored, top_address: addressWords(s.top_address), truth_exists: '', truth_top_correct: '',
          });
        }
      }
    }
  } finally { app.close(); }
  return out;
}

/* ================================================================== *
 * THE SELF-TEST — the refusals and the arithmetic, on planted rows, no network
 * ================================================================== */

async function selfTest(): Promise<number> {
  const fails: string[] = [];
  const check = (ok: boolean, what: string): void => { if (!ok) fails.push(what); };
  const root = repositoryRoot();

  // 1. The permission refuses first, whatever else is in order.
  const keys = { forOwner: () => ({ missing: () => [] as string[] }) } as unknown as SecretStore;
  check(refusalFor({ permission: MEASUREMENT_PERMISSION, paths: ['/tmp/x.csv'], repoRoot: root, secrets: keys })?.why.includes('data protection officer') === true, 'ran without the officer’s permission');
  check(refusalFor({ permission: { allowed: true }, paths: [resolve(root, 'sample.csv')], repoRoot: root, secrets: keys })?.why.includes('inside the code folder') === true, 'accepted a file inside the repository');
  check(refusalFor({ permission: { allowed: true }, paths: ['/tmp/x.csv'], repoRoot: root, secrets: keys }) === null, 'refused a proper run');
  check(MEASUREMENT_PERMISSION.allowed === false, 'the permission is recorded as given');

  // 2. The CSV survives quotes, commas and line breaks.
  const csv = toCsv(['a', 'b'], [{ a: 'x, "y"', b: 'line\nbreak' }, { a: 1, b: null }]);
  const back = parseCsv(csv);
  check(back.length === 2 && back[0]?.['a'] === 'x, "y"' && back[0]?.['b'] === 'line\nbreak' && back[1]?.['a'] === '1' && back[1]?.['b'] === '', 'the CSV did not round-trip');

  // 3. The arithmetic, on 100 planted EPC rows: 60 accepted (58 right, 2 wrong at 0.91), 20 REVIEW with a true match,
  //    20 REJECT with none. False accepts 2/60 = 3.3% > 1%, so today's 0.90 does not meet the bar; 0.92 does.
  const planted: Record<string, string>[] = [];
  for (let i = 0; i < 58; i++) planted.push({ register: 'EPC', status: 'ACCEPT', top_score: '0.97', truth_exists: 'Y', truth_top_correct: 'Y' });
  for (let i = 0; i < 2; i++) planted.push({ register: 'EPC', status: 'ACCEPT', top_score: '0.91', truth_exists: 'Y', truth_top_correct: 'N' });
  for (let i = 0; i < 20; i++) planted.push({ register: 'EPC', status: 'REVIEW', top_score: '0.80', truth_exists: 'Y', truth_top_correct: 'Y' });
  for (let i = 0; i < 20; i++) planted.push({ register: 'EPC', status: 'REJECT', top_score: '0.40', truth_exists: 'N', truth_top_correct: '' });
  planted.push({ register: 'EPC', status: 'ACCEPT', top_score: '0.99', truth_exists: '', truth_top_correct: '' }); // unjudged: not counted
  const [m] = scoreRows(planted);
  check(m !== undefined && m.judged === 100 && m.accepts === 60 && m.false_accepts === 2, 'the counts are wrong');
  check(m !== undefined && Math.abs((m.false_accept_rate ?? 0) - 2 / 60) < 1e-9 && m.meets_bar_today === false, 'the false-accept rate is wrong');
  check(m !== undefined && Math.abs((m.recall ?? 0) - 58 / 80) < 1e-9, 'the recall is wrong');
  check(m !== undefined && m.supported_accept === 0.92, `the supported threshold is ${String(m?.supported_accept)}, not 0.92`);
  check(m !== undefined && m.true_negative_rate === 1 && m.review_rate === 0.2, 'the review or true-negative rate is wrong');
  // Thresholds never move down: a clean register still reports today's value, not a lower one.
  const [clean] = scoreRows([{ register: 'CQC', status: 'ACCEPT', top_score: '0.75', truth_exists: 'Y', truth_top_correct: 'Y' }]);
  check(clean?.supported_accept === 0.90, 'a threshold moved down');

  // 4. A run, on recorded answers: one row per register, the band, and nothing judged.
  const t = fixtureTransport({
    'GET /api/non-domestic/search': { status: 404, body: '{}' }, 'GET /api/display/search': { status: 404, body: '{}' },
    'GET /entity.json': { status: 200, body: '{"entities":[]}' }, 'GET /api/applics/json': { status: 200, body: '{"records":[]}' },
  });
  const rows = await measure({
    sample: [{ id: 'S1', sector: 'dental', address_line_1: '12 Invented Road', address_line_2: '', town: 'Nowhere', postcode: 'ZZ1 1ZZ', nation: 'england' }],
    transport: t, secrets: { forOwner: () => ({ get: () => 'fixture', has: () => true, missing: () => [] }) } as unknown as SecretStore, dbPath: ':memory:', paceMs: 0,
  });
  // No ONS table here, so the care regulator has no council area to search: INSUFFICIENT_INPUT, and no call.
  const got = rows.map((r) => `${String(r['register'])}=${String(r['status'])}`).join(' ');
  check(got === 'CQC=INSUFFICIENT_INPUT EPC:non-domestic+display=REJECT PLANNING:planning.data.gov.uk=REJECT PLANNING:PlanIt=REJECT', `the run rows are ${got}`);
  check(t.seen.length === 4, `${t.seen.length} calls, not 4`);
  check(rows.every((r) => r['truth_exists'] === '' && r['truth_top_correct'] === ''), 'a row came out judged');

  for (const f of fails) console.log(`FAIL  ${f}`);
  console.log(fails.length === 0 ? 'match-measure self-test: every check held' : `match-measure self-test: ${fails.length} failed`);
  return fails.length === 0 ? 0 : 1;
}

/* ================================================================== *
 * THE COMMAND
 * ================================================================== */

async function main(argv: readonly string[]): Promise<number> {
  const arg = (k: string): string | null => { const i = argv.indexOf(k); return i === -1 ? null : argv[i + 1] ?? null; };
  if (argv.includes('--self-test')) return selfTest();
  if (argv.includes('--score')) {
    const f = arg('--score');
    if (f === null || !existsSync(f)) { console.log('give the judged results file: --score <truthed.csv>'); return 2; }
    for (const m of scoreRows(parseCsv(readFileSync(f, 'utf8')))) console.log(JSON.stringify(m));
    return 0;
  }
  if (argv.includes('--run')) {
    const sample = arg('--run'); const outFile = arg('--out'); const db = arg('--db');
    if (sample === null || outFile === null || db === null) { console.log('give --run <sample.csv> --out <results.csv> --db <audit.sqlite>'); return 2; }
    const secrets = loadSecrets();
    const no = refusalFor({ permission: MEASUREMENT_PERMISSION, paths: [sample, outFile, db], repoRoot: repositoryRoot(), secrets });
    if (no !== null) { console.log(no.why); return 2; }
    const rows = await measure({ sample: parseCsv(readFileSync(sample, 'utf8')), transport: liveTransport, secrets, dbPath: db, paceMs: 61_000 });
    writeFileSync(outFile, toCsv(RESULT_COLUMNS, rows), { mode: 0o600 });
    console.log(`${rows.length} rows written to ${outFile}; a person fills truth_exists and truth_top_correct, then --score`);
    return 0;
  }
  console.log([
    'The 200-property matching measurement (the S10 spec, A.4 and A.8 point 10).',
    `Thresholds today: ${JSON.stringify(MATCH_THRESHOLDS)} — provisional, not measured.`,
    `Registers measured: the care regulator, energy certificates, planning, and sale prices for supported living.`,
    `Not measured: the valuation office and the title register (no connector), Companies House (a name, not an address).`,
    MEASUREMENT_PERMISSION.allowed ? 'The officer’s permission is recorded.' : `Not run yet: waiting on "${MEASUREMENT_PERMISSION.question}".`,
  ].join('\n'));
  return MEASUREMENT_PERMISSION.allowed ? 0 : 2;
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e: unknown) => { console.log(String(e)); process.exitCode = 1; });
}
