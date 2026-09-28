/**
 * PHASE 151g, 28 September 2026 — THE TEST LOOKUPS LAKHBIR ALLOWED: THE SMOKE COMMAND KEEPS HIS FIVE CONDITIONS.
 *
 * Word question 170, answered 25 September 2026: yes to a few small, logged test lookups, on five conditions — no more
 * than three lookups per connector each time it is switched on; never a client's property; keep only pass or fail,
 * the time and the connector; log who ran it and why; never use it to show the product to clients.
 *
 * EVERY CONDITION IS TESTED BOTH WAYS: refused where it must refuse, allowed where it must allow.
 *
 * NO NETWORK, AND NOTHING REAL. The command is run as a person runs it, `node src/cli.ts smoke ...`, with an invented
 * log in a temporary folder, HOME moved to that folder, and an EMPTY key file — so Companies House, the source used
 * throughout, has no key and no call can leave (the run says "no call was made"). The one PASS is run in-process on
 * a recorded answer. Every company, number and postcode below is invented except the public defaults.
 *
 * The CLI tests import nothing this phase added, so run against the pre-change src/cli.ts they fail on their
 * assertions, not on an import: that is how they were proved red.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Db, migrate } from '../src/db.ts';
import { MIGRATIONS_DIR } from '../src/app.ts';

const BACKEND = join(import.meta.dirname, '..');
const CLI = join(BACKEND, 'src', 'cli.ts');
const T = '2026-09-28T09:00:00.000Z';

/** An invented client, held in an invented database. */
const CLIENT = { name: 'Harbour View Care Ltd', number: '01234567', postcode: 'B1 1AA' };

type Run = { code: number; out: string; err: string };

function world(): { dir: string; log: string; env: Record<string, string>; lines: () => Record<string, unknown>[]; raw: () => string } {
  const dir = mkdtempSync(join(tmpdir(), 'cb-151g-'));
  const keys = join(dir, 'empty-keys.env');
  writeFileSync(keys, '', { mode: 0o600 });
  const log = join(dir, 'test-lookups.jsonl');
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '', HOME: dir, CAPREBATE_SECRETS: keys, CAPREBATE_TEST_LOOKUP_LOG: log, CAPREBATE_LIVE_SMOKE: '1',
  };
  const raw = (): string => (existsSync(log) ? readFileSync(log, 'utf8') : '');
  return { dir, log, env, raw, lines: () => raw().split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as Record<string, unknown>) };
}

function cli(env: Record<string, string>, ...args: string[]): Run {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: BACKEND, env, encoding: 'utf8', timeout: 60_000 });
  return { code: r.status ?? -1, out: r.stdout, err: r.stderr };
}

const WHO = ['--who', 'Invented Tester', '--why', 'the key was just installed'];
const switchOn = (env: Record<string, string>, source = 'CH_COMPANY'): Run => cli(env, 'smoke-switched-on', source, ...WHO);
const smoke = (env: Record<string, string>, ...extra: string[]): Run => cli(env, 'smoke', 'CH_COMPANY', ...WHO, ...extra);

/** A migrated database file holding one invented client, its property and nothing else. */
function clientDb(dir: string): string {
  const file = join(dir, 'clients.db');
  const db = new Db(file);
  migrate(db, MIGRATIONS_DIR);
  db.run('INSERT INTO businesses (id,name,sector,stage,created_at,company_number) VALUES (?,?,?,?,?,?)',
    ['bz-151g', CLIENT.name, 'dental', 'ASSESSMENT_SUBMITTED', T, CLIENT.number]);
  db.run('INSERT INTO properties (id,business_id,label,postcode,created_at) VALUES (?,?,?,?,?)',
    ['pr-151g', 'bz-151g', 'Main site', CLIENT.postcode, T]);
  db.close();
  return file;
}

describe('condition 4 — who ran it and why: required, and refused when empty', () => {
  test('W1 — with neither, it is refused and nothing is logged', () => {
    const w = world();
    switchOn(w.env);
    const before = w.raw();
    const r = cli(w.env, 'smoke', 'CH_COMPANY');
    assert.equal(r.code, 1);
    assert.match(r.err, /--who and --why are required/);
    assert.equal(w.raw(), before, 'a refused run wrote to the log');
  });

  test('W2 — an empty --who, a blank --why, or a flag standing where the value should be, is refused', () => {
    const w = world();
    switchOn(w.env);
    for (const args of [['--who', '', '--why', 'x'], ['--who', 'A', '--why', '   '], ['--who', '--why', 'x']]) {
      const r = cli(w.env, 'smoke', 'CH_COMPANY', ...args);
      assert.equal(r.code, 1, args.join(' '));
      assert.match(r.err, /required and may not be empty/, args.join(' '));
    }
    assert.equal(w.lines().filter((l) => l.kind === 'lookup').length, 0);
  });

  test('W3 — recording a switch-on needs them too', () => {
    const w = world();
    const r = cli(w.env, 'smoke-switched-on', 'CH_COMPANY', '--who', 'A');
    assert.equal(r.code, 1);
    assert.match(r.err, /--why is required/);
    assert.equal(w.raw(), '');
  });

  test('W4 — with both, it runs, and both are on the line', () => {
    const w = world();
    assert.equal(switchOn(w.env).code, 0);
    const r = smoke(w.env);
    assert.match(r.out, /no call was made/, 'the empty key file must keep this run off the network');
    const l = w.lines().at(-1);
    assert.equal(l?.who, 'Invented Tester');
    assert.equal(l?.why, 'the key was just installed');
  });
});

describe('condition 3 — a log that outlives the run, keeping only what Lakhbir said', () => {
  test('L1 — a lookup leaves one line: the connector, the time, PASS or NO, who and why, and nothing else', () => {
    const w = world();
    switchOn(w.env);
    smoke(w.env, '--company-name', 'Quiet Meadow Invented Ltd', '--not-a-client', '--postcode', 'ZZ9 9ZZ', '--company-number', 'ZZ999999');
    const lookups = w.lines().filter((l) => l.kind === 'lookup');
    assert.equal(lookups.length, 1);
    assert.deepEqual(Object.keys(lookups[0] ?? {}).sort(), ['at', 'connector', 'kind', 'not_a_client', 'result', 'who', 'why']);
    assert.equal(lookups[0]?.connector, 'CH_COMPANY');
    assert.equal(lookups[0]?.result, 'NO');
    assert.match(String(lookups[0]?.at), /^\d{4}-\d\d-\d\dT/);
    for (const asked of ['Quiet Meadow', 'ZZ9 9ZZ', 'ZZ999999', '17307313', 'CAP REBATE', 'Whitehall', 'SW1A']) {
      assert.equal(w.raw().includes(asked), false, `the log carries a value that was asked: ${asked}`);
    }
  });

  test('L2 — the log survives the run: a second run reads the first one’s line', () => {
    const w = world();
    switchOn(w.env);
    smoke(w.env);
    const r = smoke(w.env);
    assert.match(r.out, /test lookup 2 of 3/);
  });

  test('L3 — a log inside the repository is refused, and not created', () => {
    const w = world();
    const inside = join(BACKEND, 'test-lookups-151g-must-not-exist.jsonl');
    const env = { ...w.env, CAPREBATE_TEST_LOOKUP_LOG: inside };
    for (const r of [cli(env, 'smoke-switched-on', 'CH_COMPANY', ...WHO), cli(env, 'smoke', 'CH_COMPANY', ...WHO)]) {
      assert.equal(r.code, 1);
      assert.match(r.err, /may not be inside the repository/);
    }
    assert.equal(existsSync(inside), false);
  });

  test('L4 — with no setting, the log is ~/.caprebate-test-lookups.jsonl', () => {
    const w = world();
    const env = { ...w.env };
    delete (env as Record<string, string | undefined>).CAPREBATE_TEST_LOOKUP_LOG;
    assert.equal(cli(env, 'smoke-switched-on', 'CH_COMPANY', ...WHO).code, 0);
    assert.equal(existsSync(join(w.dir, '.caprebate-test-lookups.jsonl')), true);
  });

  test('L5 — a line this command did not write means the count is not known: refused, and the file left alone', () => {
    const w = world();
    switchOn(w.env);
    writeFileSync(w.log, w.raw() + 'somebody typed this\n');
    const before = w.raw();
    const r = smoke(w.env);
    assert.equal(r.code, 1);
    assert.match(r.err, /count is not known/);
    assert.equal(w.raw(), before);
  });
});

describe('condition 1 — no more than three lookups per connector each time it is switched on', () => {
  test('C1 — a connector never recorded as switched on is refused, and told how', () => {
    const w = world();
    const r = smoke(w.env);
    assert.equal(r.code, 1);
    assert.match(r.err, /no "switched on" line/);
    assert.match(r.err, /smoke-switched-on CH_COMPANY/);
    assert.equal(w.raw(), '');
  });

  test('C2 — three are allowed, the fourth is refused and writes nothing', () => {
    const w = world();
    switchOn(w.env);
    for (let i = 1; i <= 3; i++) assert.match(smoke(w.env).out, new RegExp(`test lookup ${i} of 3`));
    const before = w.raw();
    const r = smoke(w.env);
    assert.equal(r.code, 1);
    assert.match(r.err, /3 of 3 test lookups since it was switched on/);
    assert.equal(w.raw(), before);
  });

  test('C3 — recording a switch-on is the only thing that starts the count again', () => {
    const w = world();
    switchOn(w.env);
    for (let i = 0; i < 3; i++) smoke(w.env);
    assert.equal(smoke(w.env).code, 1);
    assert.equal(switchOn(w.env).code, 0);
    assert.match(smoke(w.env).out, /test lookup 1 of 3/);
  });

  test('C4 — the count is each connector’s own: switching one on does not open another', () => {
    const w = world();
    switchOn(w.env, 'EPC');
    assert.match(smoke(w.env).err, /no "switched on" line/);
    switchOn(w.env);
    for (let i = 0; i < 3; i++) smoke(w.env);
    switchOn(w.env, 'EPC');
    assert.match(smoke(w.env).err, /3 of 3/, 'another connector’s switch-on reset this one');
  });
});

describe('condition 2 — never a client’s property', () => {
  test('P1 — with no database, the public defaults are allowed', () => {
    const w = world();
    switchOn(w.env);
    const r = smoke(w.env);
    assert.doesNotMatch(r.err, /refused/);
    assert.equal(w.lines().filter((l) => l.kind === 'lookup').length, 1);
    assert.equal(w.lines().at(-1)?.not_a_client, undefined);
  });

  test('P2 — with no database, anything else is refused without --not-a-client', () => {
    const w = world();
    switchOn(w.env);
    for (const extra of [['--postcode', 'ZZ9 9ZZ'], ['--company-number', 'ZZ999999'], ['--company-name', 'Quiet Meadow Invented Ltd'], ['--town', 'Invented Town']]) {
      const r = smoke(w.env, ...extra);
      assert.equal(r.code, 1, extra.join(' '));
      assert.match(r.err, /never a client.s property/, extra.join(' '));
    }
    assert.equal(w.lines().filter((l) => l.kind === 'lookup').length, 0);
  });

  test('P3 — with --not-a-client it runs, and the log says it was given', () => {
    const w = world();
    switchOn(w.env);
    smoke(w.env, '--postcode', 'ZZ9 9ZZ', '--not-a-client');
    assert.equal(w.lines().at(-1)?.not_a_client, true);
  });

  test('P4 — with CAPREBATE_DB, a client’s postcode, company number or name is refused, however it is typed, and the refusal does not repeat it', () => {
    const w = world();
    const env = { ...w.env, CAPREBATE_DB: clientDb(w.dir) };
    switchOn(env);
    const cases: [string[], RegExp][] = [
      [['--postcode', 'b11aa'], /the postcode is held/],
      [['--company-number', '1234567'], /the company number is held/],
      [['--company-name', 'HARBOUR VIEW CARE LIMITED'], /the company name is held/],
      [['--postcode', 'B1 1AA', '--not-a-client'], /the postcode is held/],
    ];
    for (const [extra, why] of cases) {
      const r = smoke(env, ...extra);
      assert.equal(r.code, 1, extra.join(' '));
      assert.match(r.err, why, extra.join(' '));
      assert.equal((r.err + r.out).includes(extra[1] ?? '\u0000'), false, `the refusal repeats the value ${extra[1]}`);
    }
    assert.equal(w.lines().filter((l) => l.kind === 'lookup').length, 0);
  });

  test('P5 — with CAPREBATE_DB, values that are nobody’s there are allowed without --not-a-client', () => {
    const w = world();
    const env = { ...w.env, CAPREBATE_DB: clientDb(w.dir) };
    switchOn(env);
    const r = smoke(env, '--postcode', 'ZZ9 9ZZ');
    assert.doesNotMatch(r.err, /refused/);
    assert.equal(w.lines().filter((l) => l.kind === 'lookup').length, 1);
  });

  test('P6 — a CAPREBATE_DB that is not there is refused, and not created', () => {
    const w = world();
    const missing = join(w.dir, 'no-such.db');
    const env = { ...w.env, CAPREBATE_DB: missing };
    switchOn(env);
    const r = smoke(env);
    assert.equal(r.code, 1);
    assert.match(r.err, /not known that these values are nobody/);
    assert.equal(existsSync(missing), false);
  });
});

describe('condition 5 — never a demonstration', () => {
  test('D1 — every run says so first, refused or not, and names the five conditions', () => {
    const w = world();
    for (const r of [cli(w.env, 'smoke', 'CH_COMPANY'), smoke(w.env)]) {
      assert.match(r.out.split('\n')[0] ?? '', /NOT A DEMONSTRATION/);
      assert.match(r.out, /five conditions/);
      assert.match(r.out, /never used to show the product to a client/);
    }
  });

  test('D2 — the old warning is gone: the question is answered', () => {
    const w = world();
    switchOn(w.env);
    const r = smoke(w.env);
    assert.doesNotMatch(r.out + r.err, /Until the data protection officer has answered/);
  });
});

describe('a PASS, in-process on a recorded answer', () => {
  test('R1 — the service took the call: PASS is logged, and nothing of the answer is', async () => {
    const L = await import('../src/connectors/test-lookups.ts');
    const { fixtureTransport } = await import('../src/connectors/http.ts');
    const { secretsFromValues, forgetRegisteredSecretsForTest } = await import('../src/secrets.ts');
    const w = world();
    const said: string[] = [];
    const deps = { now: () => T, out: (l: string) => { said.push(l); }, err: (l: string) => { said.push(l); } };
    assert.equal(L.runSwitchedOnCommand(['CH_COMPANY', ...WHO], w.env, deps), 0);
    const code = await L.runSmokeCommand(['CH_COMPANY', ...WHO], w.env, {
      ...deps, sleep: async () => {},
      transport: fixtureTransport({
        'GET /company/17307313': { status: 200, body: JSON.stringify({
          company_number: '17307313', company_name: 'CAP REBATE LTD', type: 'ltd', company_status: 'active',
          date_of_creation: '2025-01-01', registered_office_address: { postal_code: 'SW1A 2AS', address_line_1: 'Answer Street Invented' },
        }) },
        'GET /company/17307313/filing-history': { status: 200, body: JSON.stringify({ items: [] }) },
      }),
      secrets: secretsFromValues({ COMPANIES_HOUSE_API_KEY: 'ch-fixture-key-151g' }),
    });
    forgetRegisteredSecretsForTest();
    assert.equal(code, 0, said.join('\n'));
    assert.deepEqual(w.lines().at(-1), { kind: 'lookup', connector: 'CH_COMPANY', at: T, result: 'PASS', who: 'Invented Tester', why: 'the key was just installed' });
    for (const s of ['Answer Street', 'active', 'ch-fixture-key', '17307313']) assert.equal(w.raw().includes(s), false, s);
  });

  test('R2 — the normalising that the client check relies on', async () => {
    const L = await import('../src/connectors/test-lookups.ts');
    assert.equal(L.normalisePostcode(' sw1a 2as '), 'SW1A2AS');
    assert.equal(L.normaliseCompanyNumber('1234567'), '01234567');
    assert.equal(L.normaliseCompanyNumber('sc123456'), 'SC123456');
    assert.equal(L.normaliseCompanyName('Harbour View Care Limited'), L.normaliseCompanyName('HARBOUR-VIEW CARE LTD.'));
    assert.equal(L.TEST_LOOKUPS_PER_SWITCH_ON, 3);
  });
});
