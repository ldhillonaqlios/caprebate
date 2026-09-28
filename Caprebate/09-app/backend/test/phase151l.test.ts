/**
 * PHASE 151l, 28 September 2026 — THE LAND BOUNDARY'S FIRST DOWNLOAD, AS A TEST LOOKUP UNDER LAKHBIR'S FIVE CONDITIONS.
 *
 * `smoke HMLR_INSPIRE` downloads one council's INSPIRE file under the same five conditions as every other test lookup
 * (Word question 170, answered 25 September 2026), on the same log and through the same refusals in
 * src/connectors/test-lookups.ts. EVERY CONDITION IS TESTED BOTH WAYS for the boundary: refused where it must refuse,
 * allowed where it must allow. Then a PASS; a NO on a file whose shape the reader refuses; and the shipped switch,
 * BOUNDARY_FETCHING_SWITCHED_ON, untouched.
 *
 * NO NETWORK, AND NOTHING REAL. Every download is a recorded answer: the invented zips of test/fixtures/phase150, served
 * by fixtureTransport. The log is invented, in a temporary folder. The one real value is the public default point,
 * 70 Whitehall's published grid reference, and it is only ever looked for in an invented file.
 *
 * RED ON THE PRE-CHANGE CODE. These tests import only src/connectors/test-lookups.ts, http.ts, secrets.ts and the
 * boundary module, never the new file, so against the pre-change test-lookups.ts they fail on their assertions
 * (HMLR_INSPIRE is not a source there), not on an import.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as L from '../src/connectors/test-lookups.ts';
import { fixtureTransport, type Fixture } from '../src/connectors/http.ts';
import { emptySecrets } from '../src/secrets.ts';
import { Db, migrate } from '../src/db.ts';
import { MIGRATIONS_DIR } from '../src/app.ts';
import { ingestRegisterRecord } from '../src/stubs/registers.ts';
import * as B from '../../../04-phase-work/phase9/caprebate-boundary-import.ts';

const HERE = import.meta.dirname;
const T = '2026-09-28T15:00:00.000Z';
const SOURCE = 'HMLR_INSPIRE';
const WHO = ['--who', 'Invented Tester', '--why', 'confirm the shape of the land boundary file'];
const zip = (name: string): Buffer => readFileSync(join(HERE, 'fixtures', 'phase150', name));
const OK = (name: string): Fixture => ({ status: 200, body: '', bytes: zip(name), headers: { 'content-type': 'application/zip' } });

/** Inside polygon A of the invented Adur file (test/fixtures/phase150/inspire-invented.gml). */
const IN_A = ['--easting', '520050', '--northing', '180050', '--council', 'Adur_District_Council'];
const ADUR = '/datasets/inspire/download/Adur_District_Council.zip';
const WESTMINSTER = '/datasets/inspire/download/City_of_Westminster.zip';

type World = { dir: string; log: string; env: Record<string, string>; raw: () => string; lines: () => Record<string, unknown>[] };

function world(extra: Record<string, string> = {}): World {
  const dir = mkdtempSync(join(tmpdir(), 'cb-151l-'));
  const log = join(dir, 'test-lookups.jsonl');
  const env: Record<string, string> = { HOME: dir, CAPREBATE_TEST_LOOKUP_LOG: log, CAPREBATE_LIVE_SMOKE: '1', ...extra };
  const raw = (): string => (existsSync(log) ? readFileSync(log, 'utf8') : '');
  return { dir, log, env, raw, lines: () => raw().split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as Record<string, unknown>) };
}

type Ran = { code: number; out: string; err: string; seen: string[] };

async function smoke(w: World, args: readonly string[], fixtures: Record<string, Fixture> = { [`GET ${ADUR}`]: OK('inspire-invented.zip') }): Promise<Ran> {
  const out: string[] = []; const err: string[] = [];
  const t = fixtureTransport(fixtures);
  const code = await L.runSmokeCommand([SOURCE, ...args], w.env, {
    now: () => T, out: (l) => { out.push(l); }, err: (l) => { err.push(l); },
    transport: t, secrets: emptySecrets(), sleep: async () => { /* no wait */ },
  });
  return { code, out: out.join('\n'), err: err.join('\n'), seen: t.seen.map((s) => `${s.method} ${new URL(s.url).host}${new URL(s.url).pathname}${new URL(s.url).search}`) };
}

function switchOn(w: World, args: readonly string[] = WHO): number {
  return L.runSwitchedOnCommand([SOURCE, ...args], w.env, { now: () => T, out: () => {}, err: () => {} });
}

/** A migrated database file holding one invented client, its property, a point a person entered and a council added. */
function clientDb(dir: string): string {
  const file = join(dir, 'clients.db');
  const db = new Db(file);
  migrate(db, MIGRATIONS_DIR);
  db.run("INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at) VALUES ('u-151l','a@invented.test','a@invented.test','Invented Admin','ADMIN','x',?,?)", [T, T]);
  db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', ['bz-151l', 'Harbour View Care Ltd', 'dental', 'ASSESSMENT_SUBMITTED', T]);
  db.run('INSERT INTO properties (id,business_id,label,postcode,created_at) VALUES (?,?,?,?,?)', ['pr-151l', 'bz-151l', 'Main site', 'B1 1AA', T]);
  db.run("INSERT INTO site_area_inputs (id,business_id,property_id,kind,easting,northing,entered_by,entered_at) VALUES ('si-1','bz-151l','pr-151l','POINT',410000,290000,'u-151l',?)", [T]);
  db.run("INSERT INTO site_area_inputs (id,business_id,property_id,kind,lad_code,entered_by,entered_at) VALUES ('si-2','bz-151l','pr-151l','NEIGHBOUR_COUNCIL','E08000025','u-151l',?)", [T]);
  let n = 0;
  ingestRegisterRecord(db, () => `rr-${++n}`, () => T, 'bz-151l', { sourceId: 'HOMEDATA_ADDRESS', entityId: 'property:pr-151l', fields: { easting: 530000, northing: 180400 } }, { property_id: 'pr-151l' });
  db.close();
  return file;
}

describe('the connector — HMLR_INSPIRE is a source the smoke command and smoke-switched-on accept', () => {
  test('S1 — smoke-switched-on HMLR_INSPIRE writes its line, and the sources list names it', () => {
    const w = world();
    assert.equal(switchOn(w), 0);
    assert.deepEqual(w.lines(), [{ kind: 'switched_on', connector: SOURCE, at: T, who: 'Invented Tester', why: 'confirm the shape of the land boundary file' }]);
    assert.ok(L.TEST_LOOKUP_SOURCES.includes(SOURCE));
  });
});

describe('condition 4 — who and why, for the boundary', () => {
  test('B-W1 — refused without them, nothing sent, nothing logged', async () => {
    const w = world();
    switchOn(w);
    const before = w.raw();
    const r = await smoke(w, ['--who', 'Invented Tester', ...IN_A, '--not-a-client']);
    assert.equal(r.code, 1);
    assert.match(r.err, /--why is required/);
    assert.deepEqual(r.seen, []);
    assert.equal(w.raw(), before);
  });
  test('B-W2 — allowed with them, and both are on the line', async () => {
    const w = world();
    switchOn(w);
    const r = await smoke(w, [...WHO, ...IN_A, '--not-a-client']);
    assert.equal(r.code, 0, r.err + r.out);
    assert.equal(w.lines().at(-1)?.who, 'Invented Tester');
    assert.equal(w.lines().at(-1)?.why, 'confirm the shape of the land boundary file');
  });
});

describe('condition 1 — three per switch-on, counted from a smoke-switched-on HMLR_INSPIRE line', () => {
  test('B-C1 — with no switched-on line it is refused and nothing is sent', async () => {
    const w = world();
    const r = await smoke(w, [...WHO, ...IN_A, '--not-a-client']);
    assert.equal(r.code, 1);
    assert.match(r.err, /HMLR_INSPIRE has no "switched on" line/);
    assert.deepEqual(r.seen, []);
    assert.equal(w.raw(), '');
  });
  test('B-C2 — three are allowed, the fourth is refused, and a new switch-on allows three more', async () => {
    const w = world();
    switchOn(w);
    for (let i = 0; i < 3; i++) assert.equal((await smoke(w, [...WHO, ...IN_A, '--not-a-client'])).code, 0);
    const fourth = await smoke(w, [...WHO, ...IN_A, '--not-a-client']);
    assert.equal(fourth.code, 1);
    assert.match(fourth.err, /has had 3 of 3 test lookups/);
    assert.deepEqual(fourth.seen, []);
    switchOn(w);
    assert.equal((await smoke(w, [...WHO, ...IN_A, '--not-a-client'])).code, 0);
  });
  test('B-C3 — another connector\'s switch-on does not start the boundary\'s count', async () => {
    const w = world();
    L.runSwitchedOnCommand(['CH_COMPANY', ...WHO], w.env, { now: () => T, out: () => {}, err: () => {} });
    const r = await smoke(w, [...WHO, ...IN_A, '--not-a-client']);
    assert.equal(r.code, 1);
    assert.match(r.err, /no "switched on" line/);
  });
});

describe('condition 3 — the line keeps only the connector, the time, PASS or NO, who and why', () => {
  test('B-L1 — no point, no council, no polygon and no file reaches the log', async () => {
    const w = world();
    switchOn(w);
    await smoke(w, [...WHO, ...IN_A, '--not-a-client']);
    const line = w.lines().at(-1) ?? {};
    assert.deepEqual(Object.keys(line).sort(), ['at', 'connector', 'kind', 'not_a_client', 'result', 'who', 'why']);
    for (const s of ['520050', '180050', 'Adur', '99150001', 'inspire', 'zip']) assert.equal(w.raw().includes(s), false, s);
  });
});

describe('condition 2 — never a client\'s property: a typed point or council, as a postcode is', () => {
  test('B-P1 — with no database, the public default point and council need nothing said', async () => {
    const w = world();
    switchOn(w);
    const r = await smoke(w, WHO, { [`GET ${WESTMINSTER}`]: OK('inspire-invented.zip') });
    assert.doesNotMatch(r.err, /refused/);
    assert.deepEqual(r.seen, [`GET use-land-property-data.service.gov.uk${WESTMINSTER}`], 'only the council\'s name leaves');
    assert.equal(w.lines().at(-1)?.not_a_client, undefined);
  });
  test('B-P2 — with no database, a typed point is refused without --not-a-client, and nothing is sent', async () => {
    const w = world();
    switchOn(w);
    const r = await smoke(w, [...WHO, '--easting', '520050', '--northing', '180050']);
    assert.equal(r.code, 1);
    assert.match(r.err, /the point is not the public test value/);
    assert.deepEqual(r.seen, []);
    assert.equal(w.lines().filter((l) => l.kind === 'lookup').length, 0);
  });
  test('B-P3 — with no database, a typed council is refused without --not-a-client', async () => {
    const w = world();
    switchOn(w);
    const r = await smoke(w, [...WHO, '--council', 'Adur_District_Council']);
    assert.equal(r.code, 1);
    assert.match(r.err, /the council is not the public test value/);
    assert.deepEqual(r.seen, []);
  });
  test('B-P4 — with --not-a-client, a typed point and council are allowed, and the line says so', async () => {
    const w = world();
    switchOn(w);
    const r = await smoke(w, [...WHO, ...IN_A, '--not-a-client']);
    assert.equal(r.code, 0, r.err + r.out);
    assert.equal(w.lines().at(-1)?.not_a_client, true);
  });
  test('B-P5 — with CAPREBATE_DB, a point near one held for a client is refused, --not-a-client or not', async () => {
    const w = world();
    w.env.CAPREBATE_DB = clientDb(w.dir);
    switchOn(w);
    for (const pt of [['--easting', '410100', '--northing', '290100'], ['--easting', '530050', '--northing', '180300']]) {
      const r = await smoke(w, [...WHO, ...pt, '--not-a-client']);
      assert.equal(r.code, 1, pt.join(' '));
      assert.match(r.err, /within 250 metres of a point held in the database/);
      assert.doesNotMatch(r.err, /410100|530050/, 'the refusal named the value');
      assert.deepEqual(r.seen, []);
    }
  });
  test('B-P6 — with CAPREBATE_DB, a council added for a client\'s property is refused', async () => {
    const w = world();
    w.env.CAPREBATE_DB = clientDb(w.dir);
    switchOn(w);
    const r = await smoke(w, [...WHO, '--council', 'E08000025']);
    assert.equal(r.code, 1);
    assert.match(r.err, /the council is held in the database/);
  });
  test('B-P7 — with CAPREBATE_DB, a point and council held for nobody are allowed, and nothing is stored there', async () => {
    const w = world();
    const file = clientDb(w.dir);
    w.env.CAPREBATE_DB = file;
    switchOn(w);
    const r = await smoke(w, [...WHO, ...IN_A]);
    assert.equal(r.code, 0, r.err + r.out);
    const db = new Db(file);
    try {
      assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM register_records WHERE source_id = 'HMLR_INSPIRE'")?.n, 0, 'the polygon was stored through the one door');
    } finally { db.close(); }
  });
  test('B-P8 — a point outside the national grid, or one half of it, is refused before anything', async () => {
    const w = world();
    switchOn(w);
    const cases: [string[], RegExp][] = [
      [['--easting', '900000', '--northing', '180000'], /outside Great Britain's national grid/],
      [['--easting', '520050'], /--easting and --northing go together/],
      [['--council', 'Nowhere_Council'], /is not in our list of HM Land Registry's land boundary files/],
    ];
    for (const [a, said] of cases) {
      const r = await smoke(w, [...WHO, ...a, '--not-a-client']);
      assert.equal(r.code, 1, a.join(' '));
      assert.match(r.err, said, a.join(' '));
      assert.deepEqual(r.seen, []);
    }
    assert.equal(w.lines().filter((l) => l.kind === 'lookup').length, 0);
  });
});

describe('condition 5 — never a demonstration', () => {
  test('B-D1 — the notice and the five conditions come first, on every run, refused or not', async () => {
    const w = world();
    const r = await smoke(w, WHO);
    assert.match(r.out, /^THIS IS A TEST OF A CONNECTION, NOT A DEMONSTRATION/);
    assert.match(r.out, /5\. It is never used to show the product to a client/);
    const live = await smoke(world({ CAPREBATE_LIVE_SMOKE: '' }), WHO);
    assert.equal(live.code, 1);
    assert.match(live.err, /CAPREBATE_LIVE_SMOKE=1/);
  });
});

describe('what a PASS means, and a NO on a file whose shape the reader refuses', () => {
  test('B-R1 — PASS: the file downloaded, every polygon read, the polygon holding the point found; nothing kept', async () => {
    const store = mkdtempSync(join(tmpdir(), 'cb-151l-store-'));
    const w = world({ CAPREBATE_INSPIRE_STORE_DIR: store });
    switchOn(w);
    const r = await smoke(w, [...WHO, ...IN_A, '--not-a-client']);
    assert.equal(r.code, 0, r.err + r.out);
    assert.match(r.out, /PASS {2}HMLR_INSPIRE/);
    assert.match(r.out, /every polygon in it was read, and the one polygon holding the point was found/);
    assert.equal(w.lines().at(-1)?.result, 'PASS');
    assert.deepEqual(readdirSync(store), [], 'the downloaded file was kept');
    assert.doesNotMatch(r.out, /99150001|520000|180000/, 'the polygon or a coordinate was printed');
  });
  test('B-R2 — NO: the reader refuses the file, so the shape is not confirmed', async () => {
    const w = world();
    switchOn(w);
    const r = await smoke(w, [...WHO, ...IN_A, '--not-a-client'], { [`GET ${ADUR}`]: OK('inspire-unreadable.zip') });
    assert.equal(r.code, 1);
    assert.match(r.out, /NO {2}HMLR_INSPIRE/);
    assert.match(r.out, /stage reached: SHAPE_REFUSED/);
    assert.equal(w.lines().at(-1)?.result, 'NO');
  });
  test('B-R3 — NO: every polygon read, but none holds the point (the default point in an invented file)', async () => {
    const w = world();
    switchOn(w);
    const r = await smoke(w, WHO, { [`GET ${WESTMINSTER}`]: OK('inspire-invented.zip') });
    assert.equal(r.code, 1);
    assert.match(r.out, /stage reached: NOT_FOUND/);
    assert.match(r.out, /every polygon in it was read/);
  });
  test('B-R4 — NO: the service would not give the file, and the NO is still logged', async () => {
    const w = world();
    switchOn(w);
    const r = await smoke(w, [...WHO, ...IN_A, '--not-a-client'], { [`GET ${ADUR}`]: { status: 404, body: 'not found' } });
    assert.equal(r.code, 1);
    assert.match(r.out, /stage reached: NOT_DOWNLOADED/);
    assert.equal(w.lines().at(-1)?.result, 'NO');
  });
});

describe('the switch that ships stays false', () => {
  test('B-X1 — after a PASS, BOUNDARY_FETCHING_SWITCHED_ON is false, in the module and in its source', async () => {
    const w = world();
    switchOn(w);
    assert.equal((await smoke(w, [...WHO, ...IN_A, '--not-a-client'])).code, 0);
    assert.equal(B.BOUNDARY_FETCHING_SWITCHED_ON, false);
    const src = readFileSync(join(HERE, '..', '..', '..', '04-phase-work', 'phase9', 'caprebate-boundary-import.ts'), 'utf8');
    assert.match(src, /^export const BOUNDARY_FETCHING_SWITCHED_ON = false as const;$/m);
    await assert.rejects(B.DEFAULT_FETCHER({ kind: 'PARCEL_BOUNDARY', dataset: 'HMLR_INSPIRE_INDEX_POLYGON', locator: 'x' }));
  });
});

// A log that is not ours still refuses the boundary, the same way (the shared read, not a copy of it).
describe('the shared refusals', () => {
  test('B-G1 — an unreadable log refuses the boundary before anything is sent', async () => {
    const w = world();
    mkdirSync(w.dir, { recursive: true });
    writeFileSync(w.log, '{"kind":"switched_on","connector":"HMLR_INSPIRE","at":"x","who":"a","why":"b"}\nnot a line of ours\n');
    const r = await smoke(w, [...WHO, ...IN_A, '--not-a-client']);
    assert.equal(r.code, 1);
    assert.match(r.err, /is not one this command wrote/);
    assert.deepEqual(r.seen, []);
  });
});
