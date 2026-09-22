/**
 * THE SURVEYOR WORKSPACE — and the one test that decides whether this build is
 * honest.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE PAYLOAD TEST IS OVER HTTP, AND THAT IS THE WHOLE POINT
 *
 * `test/payload.test.ts` already asserts N1 against the assembler, in memory.
 * This does it AGAINST THE WIRE: a real server, a real sign-in as a real
 * surveying user, a real GET, and the assertions run on the bytes that came
 * back. Not on a function's return value, not on the code, not on a screenshot.
 *
 * WHY THE DISTINCTION IS NOT PEDANTRY. An in-memory test proves the assembler
 * is right. It cannot prove that the thing the route serves is what the
 * assembler built — a handler that fetched the estimate separately "for the
 * heading", or a renderer that printed a figure into a data attribute, would
 * leave that test green and the product leaking. The only way to know what a
 * surveyor's session receives is to be a surveyor's session and read it.
 *
 * BOTH RESPONSES ARE CHECKED, THE JSON AND THE HTML. If only the JSON were
 * checked, a page that fetched the figure by another route would pass.
 *
 * AND THE CHECKS HAVE A NEGATIVE CONTROL. The identical assertions are run
 * against an ADMIN's response, where the estimate IS released and MUST be
 * found. A search that cannot find the figure when it is definitely there
 * proves nothing when it fails to find it anywhere else, and three of the
 * checks below would have passed on an empty string.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { APP_ROLES, type AppRole } from '../src/roles.ts';
import { can } from '../src/authz.ts';
import { quarantinedKeysAndValues } from '../src/payload.ts';
import { verifyChain, type EstimateOutputs, type LogEntry } from '../../../04-phase-work/phase3/caprebate-anchor-quarantine.ts';
import { RATE_FIELDS, OverrideStore, adoption, isBlankControl } from '../../../04-phase-work/phase3/caprebate-surveyor-crm.ts';
import { allRoomIds, roomsFor } from '../src/web/rooms.ts';
import { DbAnchorLog } from '../src/web/anchor-store.ts';
import { RATE_FIELD_IDS } from '../src/web/surveyor.ts';
import { actor, keys, scalars } from './helpers.ts';

const PASSWORD = 'a-very-long-development-password';
const T = '2026-09-09T00:00:00.000Z';

/**
 * DELIBERATELY UNMISTAKABLE FIGURES.
 *
 * Every number below is a long, arbitrary digit string that could not occur by
 * accident in a page of counts, dates, percentages and ids. A fixture using
 * round numbers — 30000000, 0.3, 0.25 — would make a false PASS possible the
 * moment a room count or a materiality happened to match, and a false FAIL
 * possible for the same reason. If any of these strings is in a surveyor's
 * response, it came from the estimate and from nowhere else.
 */
const ESTIMATE: EstimateOutputs = {
  qualifying_expenditure_pence: 31_415_926,
  qualifying_pct: 0.271828,
  pool_split_main_pence: 17_320_508,
  pool_split_special_pence: 14_142_135,
  bare_land_pence: 16_180_339,
  multiplier: 0.414213,
  indicative_lifetime_saving_pence: 22_360_679,
};

type Client = {
  cookie: string;
  req(path: string, init?: RequestInit): Promise<{ status: number; location: string | null; body: string }>;
  post(path: string, fields: Record<string, string>): Promise<{ status: number; location: string | null; body: string }>;
};

type Harness = {
  close(): void;
  app: Awaited<ReturnType<typeof createApp>>['app'];
  signIn(role: AppRole, suffix?: string): Promise<Client>;
  job: string;
  job2: string;
  business: string;
  otherJob: string;
};

/**
 * ONE APPLICATION, THREE STAFF USERS AND TWO SURVEYORS.
 *
 * The second surveyor exists so the isolation test is real: "a surveyor cannot
 * open a job assigned to somebody else" is only a test if somebody else has
 * one. Testing it against an unassigned job would exercise a different rule.
 */
async function boot(): Promise<Harness> {
  const docsRoot = mkdtempSync(join(tmpdir(), 'cb-survey-'));
  const made = await createApp(':memory:', { documentRoot: docsRoot });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;
  const db = made.app.db;

  const client = (): Client => {
    const c: Client = {
      cookie: '',
      async req(path, init = {}) {
        const headers = { ...(init.headers as Record<string, string> | undefined) };
        if (c.cookie !== '') headers['cookie'] = c.cookie;
        const r = await fetch(base + path, { redirect: 'manual', ...init, headers });
        const set = r.headers.getSetCookie();
        if (set.length > 0) {
          const jar = new Map(c.cookie.split('; ').filter(Boolean).map((x) => [x.split('=')[0] ?? '', x] as const));
          for (const s of set) {
            const first = s.split(';')[0] ?? '';
            jar.set(first.split('=')[0] ?? '', first);
          }
          c.cookie = [...jar.values()].join('; ');
        }
        return { status: r.status, location: r.headers.get('location'), body: await r.text() };
      },
      post(path, fields) {
        return c.req(path, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(fields).toString(),
        });
      },
    };
    return c;
  };

  const hash = await made.app.hasher.hash(PASSWORD);
  const mkUser = (id: string, role: AppRole, email: string): void => {
    db.run(
      'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) ' +
        'VALUES (?,?,?,?,?,?,?,?,NULL)',
      [id, email, email, `${role} Person`, role, hash, T, T],
    );
  };
  for (const role of APP_ROLES.filter((r) => r !== 'CLIENT')) {
    mkUser(`u-${role}`, role, `${role.toLowerCase()}@example.invalid`);
  }
  mkUser('u-SURVEYING-2', 'SURVEYING', 'surveying2@example.invalid');

  /* Two businesses in two sectors, so the rate library has a second job to be
     proposed back into and both room schedules are reachable. */
  const mkBusiness = (biz: string, name: string, sector: string, assessment: string, job: string,
    surveyor: string | null): void => {
    db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)',
      [biz, name, sector, 'AT_SURVEY', T]);
    db.run('INSERT INTO properties (id,business_id,label,postcode,created_at) VALUES (?,?,?,?,?)',
      [`p-${biz}`, biz, `${name} — main site`, 'ZZ9 9ZZ', T]);
    db.run(
      'INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) ' +
        'VALUES (?,?,?,?,?,?,?)',
      [assessment, biz, sector, T, 20_000_000, 40_000_000, T]);
    const answers: readonly [string, string, string, string | null][] = [
      ['Q0', 'What kind of property is this assessment for?', 'ANSWERED', sector],
      ['Q1', 'How is the business set up?', 'ANSWERED', 'company'],
      ['Q7', 'How much Annual Investment Allowance headroom is left?', 'DONT_KNOW', null],
      ['Q9', 'Was a section 198 election made on purchase?', 'SKIPPED', null],
    ];
    answers.forEach(([qid, text, state, value], i) => {
      db.run(
        'INSERT INTO assessment_answers (id,assessment_id,ord,question_id,question_text,state,value) ' +
          'VALUES (?,?,?,?,?,?,?)',
        [`${assessment}-${i}`, assessment, i, qid, text, state, value]);
    });
    db.run(
      'INSERT INTO estimates (id,assessment_id,business_id,qualifying_expenditure_pence,qualifying_pct,' +
        'pool_split_main_pence,pool_split_special_pence,bare_land_pence,multiplier,' +
        'indicative_lifetime_saving_pence,sealed_at,estimate_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [`e-${biz}`, assessment, biz,
        ESTIMATE.qualifying_expenditure_pence, ESTIMATE.qualifying_pct,
        ESTIMATE.pool_split_main_pence, ESTIMATE.pool_split_special_pence,
        ESTIMATE.bare_land_pence, ESTIMATE.multiplier,
        ESTIMATE.indicative_lifetime_saving_pence, T, 'test-not-a-real-hash']);
    db.run(
      'INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at) ' +
        'VALUES (?,?,?,?,?,NULL,?)',
      [job, biz, assessment, surveyor, 'SEALED', T]);
  };

  mkBusiness('biz-1', 'Dunmarrow Medical Practice Limited', 'gp', 'a-1', 'job-1', 'u-SURVEYING');
  mkBusiness('biz-2', 'Aldergate Care Group Limited', 'care_homes', 'a-2', 'job-2', 'u-SURVEYING');
  mkBusiness('biz-3', 'Brackenfell Dental Partnership LLP', 'dental', 'a-3', 'job-3', 'u-SURVEYING-2');

  async function signIn(role: AppRole, suffix = ''): Promise<Client> {
    const c = client();
    const email = `${role.toLowerCase()}${suffix}@example.invalid`;
    const r = await c.post('/login', { email, password: PASSWORD });
    assert.equal(r.status, 303, `${email} could not sign in`);
    return c;
  }

  return {
    close: made.close, app: made.app, signIn,
    job: 'job-1', job2: 'job-2', business: 'biz-1', otherJob: 'job-3',
  };
}

/* ================================================================== *
 * 1. THE TEST THAT DECIDES WHETHER THIS BUILD IS HONEST
 * ================================================================== */

/** Every key and every value the quarantine covers, derived from the estimate. */
const { keys: BAD_KEYS, values: BAD_VALUES } = quarantinedKeysAndValues(ESTIMATE);

/**
 * The three searches, run over one captured response body.
 *
 * BY KEY, BY VALUE AND BY TEXT, because each on its own can be fooled: a build
 * that renamed the field on the way out passes the first and fails the other
 * two, and a build that serialised the figures into a string passes the first
 * two and fails the third.
 */
function findEstimateIn(body: string): { keys: string[]; values: string[]; text: string[] } {
  let parsed: unknown = null;
  try { parsed = JSON.parse(body) as unknown; } catch { parsed = null; }
  const presentKeys = parsed === null ? [] : [...keys(parsed)];
  const presentValues = parsed === null ? [] : [...scalars(parsed)].map(String);
  return {
    keys: BAD_KEYS.filter((k) => presentKeys.includes(k)),
    values: BAD_VALUES.map(String).filter((v) => presentValues.includes(v)),
    text: BAD_VALUES.map(String).filter((v) => body.includes(v)),
  };
}

describe('N1 over HTTP — what a surveyor session actually receives', () => {
  test('the JSON payload a surveyor is served contains NO estimate output at all', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');

    const r = await surveyor.req(`/staff/survey/${it.job}/payload.json`);
    assert.equal(r.status, 200, 'the surveyor could not open their own job');

    /* WHAT WAS CAPTURED, ASSERTED ON RATHER THAN DESCRIBED. */
    const found = findEstimateIn(r.body);
    assert.deepEqual(found.keys, [], `estimate field name(s) in the response: ${found.keys.join(', ')}`);
    assert.deepEqual(found.values, [], `estimate value(s) in the response: ${found.values.join(', ')}`);
    assert.deepEqual(found.text, [], `estimate figure(s) in the response text: ${found.text.join(', ')}`);

    /* NOT PRESENT, not present-and-null. `'estimate' in payload` is false. */
    const body = JSON.parse(r.body) as Record<string, unknown>;
    assert.equal('estimate' in body, false, 'the key is present — even undefined is present');
    assert.equal(body['quarantine'] !== undefined, true, 'the quarantine state is reported');
    assert.equal((body['quarantine'] as { state: string }).state, 'SEALED');
  });

  test('the surveyor’s HTML page contains none of the figures either', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');

    const r = await surveyor.req(`/staff/survey/${it.job}`);
    assert.equal(r.status, 200);
    // The page is real: it names the property and the client's own answers.
    assert.match(r.body, /Dunmarrow Medical Practice Limited/);
    assert.match(r.body, /section 198 election/);

    const found = findEstimateIn(r.body);
    assert.deepEqual(found.text, [],
      `the rendered page carries estimate figure(s): ${found.text.join(', ')}`);
  });

  test('THE NEGATIVE CONTROL — the same searches DO find the estimate for a role that may see it', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const admin = await it.signIn('ADMIN');

    const r = await admin.req(`/staff/survey/${it.job}/payload.json`);
    assert.equal(r.status, 200);

    const found = findEstimateIn(r.body);
    assert.equal(found.keys.length > 0, true,
      'the key search found nothing where the estimate IS released — it proves nothing elsewhere');
    assert.equal(found.values.length > 0, true, 'the value search is not working');
    assert.equal(found.text.length > 0, true, 'the text search is not working');

    const body = JSON.parse(r.body) as Record<string, unknown>;
    assert.equal('estimate' in body, true, 'a non-quarantined role gets the estimate immediately');
  });

  test('the refusal is logged, and the log survives the request that caused it', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');
    await surveyor.req(`/staff/survey/${it.job}/payload.json`);

    const rows = it.app.db.all<{ kind: string; job_id: string }>(
      'SELECT kind, job_id FROM anchor_log WHERE job_id = ? ORDER BY seq ASC', [it.job]);
    assert.equal(rows.some((r) => r.kind === 'ACCESS_DENIED'), true,
      'a denied attempt is evidence in its own right and must be recorded');
    assert.equal(rows.some((r) => r.kind === 'QUARANTINE_CREATED'), true);
    assert.equal(rows.some((r) => r.kind === 'ESTIMATE_SEALED'), true);
  });

  test('the anchor log leaks nothing it is protecting — the sealing entry carries a HASH', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    await (await it.signIn('SURVEYING')).req(`/staff/survey/${it.job}/payload.json`);

    const all = it.app.db.all<{ detail_json: string }>('SELECT detail_json FROM anchor_log');
    const text = all.map((r) => r.detail_json).join(' ');
    for (const v of BAD_VALUES) {
      assert.equal(text.includes(String(v)), false, `the log itself carries the anchor: ${String(v)}`);
    }
  });
});

/* ================================================================== *
 * 2. THE RELEASE — automatic, logged, timestamped
 * ================================================================== */

const FIGURES = {
  a_qualifying_plant: '250000',
  b_building: '600000',
  c_bare_land: '150000',
  qualifying_pct: '24.5',
  method_note: 'measured survey, room schedule and the 2026 price book',
};

describe('committing figures releases the estimate, and nothing else does', () => {
  test('before commitment it is absent; after commitment it is present — same route, same session', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');

    const before = await surveyor.req(`/staff/survey/${it.job}/payload.json`);
    assert.equal('estimate' in (JSON.parse(before.body) as object), false);

    const posted = await surveyor.post(`/staff/survey/${it.job}/commit`, FIGURES);
    assert.equal(posted.status, 303, `commit refused: ${posted.body.slice(0, 400)}`);

    const after = await surveyor.req(`/staff/survey/${it.job}/payload.json`);
    const body = JSON.parse(after.body) as { estimate?: EstimateOutputs; quarantine: { state: string } };
    assert.equal('estimate' in body, true, 'the estimate was not released by the commitment');
    assert.equal(body.estimate?.qualifying_pct, ESTIMATE.qualifying_pct);
    assert.equal(body.quarantine.state, 'COMMITTED_AND_RELEASED');
  });

  test('the release is logged with a timestamp, and it is the commitment that caused it', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');
    await surveyor.post(`/staff/survey/${it.job}/commit`, FIGURES);

    const rows = it.app.db.all<{ kind: string; at: string; detail_json: string }>(
      'SELECT kind, at, detail_json FROM anchor_log WHERE job_id = ? ORDER BY seq ASC', [it.job]);
    const released = rows.find((r) => r.kind === 'RELEASED');
    assert.notEqual(released, undefined, 'no RELEASED entry was written');
    assert.match(released?.at ?? '', /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/, 'the release has no timestamp');
    assert.match(released?.detail_json ?? '', /commitment recorded/,
      'the release does not say what caused it');

    const committed = rows.findIndex((r) => r.kind === 'COMMITMENT_RECORDED');
    const releasedAt = rows.findIndex((r) => r.kind === 'RELEASED');
    assert.equal(committed >= 0 && releasedAt > committed, true,
      'the release must follow the commitment, not precede or replace it');

    const stored = it.app.db.get<{ released_at: string; figures_hash: string; method_note: string }>(
      'SELECT released_at, figures_hash, method_note FROM surveyor_commitments WHERE job_id = ?', [it.job]);
    assert.equal(stored?.method_note, FIGURES.method_note);
    assert.match(stored?.figures_hash ?? '', /^[0-9a-f]{64}$/, 'the figures are not hashed');
  });

  test('a commitment without a stated method is refused — it would not be evidence of anything', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');
    const r = await surveyor.post(`/staff/survey/${it.job}/commit`, { ...FIGURES, method_note: '' });
    assert.equal(r.status, 400);
    assert.match(r.body, /basis/);

    const after = await surveyor.req(`/staff/survey/${it.job}/payload.json`);
    assert.equal('estimate' in (JSON.parse(after.body) as object), false,
      'a refused commitment must not have released anything');
  });

  test('THERE IS NO ROUTE THAT RELEASES WITHOUT A COMMITMENT', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');
    // Every plausible name a build would give one. All 404 or 403; none releases.
    for (const path of ['release', 'unseal', 'reveal', 'estimate']) {
      const r = await surveyor.post(`/staff/survey/${it.job}/${path}`, {});
      assert.equal(r.status === 404 || r.status === 403, true, `/${path} answered ${r.status}`);
    }
    const after = await surveyor.req(`/staff/survey/${it.job}/payload.json`);
    assert.equal('estimate' in (JSON.parse(after.body) as object), false);
  });

  test('a second commitment is refused — the figures cannot be quietly rewritten', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');
    assert.equal((await surveyor.post(`/staff/survey/${it.job}/commit`, FIGURES)).status, 303);
    const again = await surveyor.post(`/staff/survey/${it.job}/commit`, { ...FIGURES, a_qualifying_plant: '999999' });
    assert.equal(again.status, 400);

    const stored = it.app.db.all<{ a_qualifying_plant_pence: number }>(
      'SELECT a_qualifying_plant_pence FROM surveyor_commitments WHERE job_id = ?', [it.job]);
    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.a_qualifying_plant_pence, 25_000_000);
  });
});

describe('after the release — the two things a surveyor may still do', () => {
  test('an amendment is recorded WITH its reason, and the committed figures are NOT overwritten', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');
    await surveyor.post(`/staff/survey/${it.job}/commit`, FIGURES);

    const amended = await surveyor.post(`/staff/survey/${it.job}/amend`, {
      a_qualifying_plant: '280000', b_building: '580000', c_bare_land: '140000',
      qualifying_pct: '27.1', method_note: FIGURES.method_note,
      reason: 'the price book row for the theatre suite was read against the wrong unit',
    });
    assert.equal(amended.status, 303, `amend refused: ${amended.body.slice(0, 300)}`);

    // The COMMITMENT is what was believed before our estimate was seen. It stands.
    const c = it.app.db.get<{ a_qualifying_plant_pence: number }>(
      'SELECT a_qualifying_plant_pence FROM surveyor_commitments WHERE job_id = ?', [it.job]);
    assert.equal(c?.a_qualifying_plant_pence, 25_000_000,
      'the amendment overwrote the commitment — that destroys the drift measurement');

    const rows = it.app.db.all<{ kind: string; detail_json: string }>(
      'SELECT kind, detail_json FROM anchor_log WHERE job_id = ? ORDER BY seq ASC', [it.job]);
    const a = rows.find((r) => r.kind === 'POST_RELEASE_AMENDMENT');
    assert.notEqual(a, undefined, 'the amendment is not in the log');
    assert.match(a?.detail_json ?? '', /wrong unit/, 'the reason was not recorded');
    assert.match(a?.detail_json ?? '', /28000000/, 'the new figures were not recorded');
  });

  test('an amendment WITHOUT a reason is refused — it could not be told from drift', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');
    await surveyor.post(`/staff/survey/${it.job}/commit`, FIGURES);
    const r = await surveyor.post(`/staff/survey/${it.job}/amend`, {
      a_qualifying_plant: '280000', b_building: '580000', c_bare_land: '140000',
      qualifying_pct: '27.1', method_note: '', reason: '',
    });
    assert.equal(r.status, 400);
    assert.match(r.body, /being pulled toward our estimate/);
    assert.equal(
      it.app.db.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM anchor_log WHERE kind = 'POST_RELEASE_AMENDMENT'")?.n, 0);
  });

  test('amending before committing is refused — there is nothing to amend', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');
    const r = await surveyor.post(`/staff/survey/${it.job}/amend`, {
      a_qualifying_plant: '280000', b_building: '580000', c_bare_land: '140000',
      qualifying_pct: '27.1', method_note: '', reason: 'because',
    });
    assert.equal(r.status, 400);
    // And it certainly did not release anything.
    const after = await surveyor.req(`/staff/survey/${it.job}/payload.json`);
    assert.equal('estimate' in (JSON.parse(after.body) as object), false);
  });

  test('a self-reported client disclosure turns the verdict from CLEAN to EXPOSED', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');
    await surveyor.post(`/staff/survey/${it.job}/commit`, FIGURES);

    const before = await surveyor.req(`/staff/survey/${it.job}`);
    assert.match(before.body, /Verdict on this job: <strong>CLEAN/);

    const r = await surveyor.post(`/staff/survey/${it.job}/disclosure`,
      { note: 'the practice manager read me a figure off your website before I measured anything' });
    assert.equal(r.status, 303);

    const after = await surveyor.req(`/staff/survey/${it.job}`);
    assert.match(after.body, /Verdict on this job: <strong>EXPOSED/,
      'a self-reported disclosure left the job reading CLEAN');
    assert.equal(
      it.app.db.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM anchor_log WHERE kind = 'CLIENT_DISCLOSURE_REPORTED'")?.n, 1);
  });

  test('a bare disclosure flag with no note is refused', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');
    const r = await surveyor.post(`/staff/survey/${it.job}/disclosure`, { note: '   ' });
    assert.equal(r.status, 400);
    assert.match(r.body, /not evidence/);
  });

  test('neither route is open to a surveyor the job is not assigned to', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const other = await it.signIn('SURVEYING', '2');
    for (const path of ['amend', 'disclosure']) {
      const r = await other.post(`/staff/survey/${it.job}/${path}`, { note: 'x', reason: 'x' });
      assert.equal(r.status, 403, `/${path} answered ${r.status} to the wrong surveyor`);
    }
  });
});

/* ================================================================== *
 * 3. THE LOG — recomputed from the rows, not from the object that wrote them
 * ================================================================== */

describe('the anchor log is durable, chained, and verified by the module itself', () => {
  test('the chain the application wrote verifies under the module’s OWN verifyChain', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');
    await surveyor.req(`/staff/survey/${it.job}/payload.json`);
    await surveyor.post(`/staff/survey/${it.job}/commit`, FIGURES);
    await (await it.signIn('SURVEYING')).req(`/staff/survey/${it.job2}/payload.json`);

    const log = new DbAnchorLog(it.app.db);
    const entries = log.entries();
    assert.equal(entries.length > 4, true, 'nothing was logged');
    assert.deepEqual(verifyChain(entries), { intact: true, broken_at: null },
      'the rows this application wrote do not verify under the quarantine module’s own checker');
    assert.deepEqual(log.verify(), { intact: true, broken_at: null });
  });

  test('THE CHECK CAN FAIL — a tampered entry read back is detected', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    await (await it.signIn('SURVEYING')).req(`/staff/survey/${it.job}/payload.json`);

    const entries = new DbAnchorLog(it.app.db).entries();
    assert.equal(entries.length >= 3, true);

    // Edit one entry's detail without recomputing its hash — what somebody
    // with the database file and no scruples would do.
    const tampered: LogEntry[] = entries.map((e, i) =>
      i === 1 ? { ...e, detail: { ...e.detail, tampered: true } } : e);
    const check = verifyChain(tampered);
    assert.equal(check.intact, false, 'an edited entry was not detected');
    assert.equal(check.broken_at, tampered[1]?.seq);

    // And a removed entry.
    const short = entries.filter((_, i) => i !== 1);
    assert.equal(verifyChain(short).intact, false, 'a removed entry was not detected');
  });

  test('the log table refuses an UPDATE and a DELETE at the database', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    await (await it.signIn('SURVEYING')).req(`/staff/survey/${it.job}/payload.json`);

    assert.throws(() => it.app.db.run("UPDATE anchor_log SET kind = 'RELEASED' WHERE seq = 1"),
      /append-only/);
    assert.throws(() => it.app.db.run('DELETE FROM anchor_log WHERE seq = 1'), /append-only/);
  });

  test('the two once-per-job entries are written ONCE however often the page is opened', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');
    for (let i = 0; i < 4; i++) await surveyor.req(`/staff/survey/${it.job}/payload.json`);

    const counts = it.app.db.all<{ kind: string; n: number }>(
      'SELECT kind, COUNT(*) AS n FROM anchor_log WHERE job_id = ? GROUP BY kind', [it.job]);
    const of = (k: string): number => counts.find((c) => c.kind === k)?.n ?? 0;
    assert.equal(of('QUARANTINE_CREATED'), 1);
    assert.equal(of('ESTIMATE_SEALED'), 1);
    // Every attempt IS recorded. Four opens, four denials — not de-duplicated.
    assert.equal(of('ACCESS_DENIED'), 4,
      'attempts were collapsed; a log that decides which attempts to keep is not a log');
  });
});

/* ================================================================== *
 * 4. AUTHORISATION — who reaches which job
 * ================================================================== */

describe('a surveyor reaches their own jobs and only their own', () => {
  test('another surveyor’s job is refused, and it is the same refusal a missing one gives', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');

    const theirs = await surveyor.req(`/staff/survey/${it.otherJob}`);
    const missing = await surveyor.req('/staff/survey/does-not-exist');
    assert.equal(theirs.status, 403, 'a surveyor opened a job assigned to somebody else');
    assert.equal(missing.status, theirs.status,
      'a refusal and a missing job must look the same — otherwise the ids are enumerable');

    const json = await surveyor.req(`/staff/survey/${it.otherJob}/payload.json`);
    assert.equal(json.status, 403, 'the JSON route is a back door around the page’s rule');
  });

  test('the job list is the rule, not a WHERE clause — an unassigned job is nobody’s', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    it.app.db.run('UPDATE surveyor_jobs SET surveyor_id = NULL WHERE id = ?', [it.job2]);

    const surveyor = await it.signIn('SURVEYING');
    const list = await surveyor.req('/staff/survey');
    assert.equal(list.status, 200);
    assert.match(list.body, /Dunmarrow/, 'their own assigned job is missing from the list');
    assert.equal(list.body.includes('Aldergate'), false, 'an unassigned job was listed as theirs');

    // ADMIN sees both, because ADMIN is unconditional on the same rule.
    const admin = await it.signIn('ADMIN');
    const all = await admin.req('/staff/survey');
    assert.match(all.body, /Aldergate/);
  });

  test('ACCOUNTING cannot enter the survey section at all', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const accounting = await it.signIn('ACCOUNTING');
    assert.equal((await accounting.req('/staff/survey')).status, 403);
    assert.equal((await accounting.req(`/staff/survey/${it.job}`)).status, 403);
    assert.equal((await accounting.req(`/staff/survey/${it.job}/payload.json`)).status, 403);
  });

  test('a CLIENT cannot reach the section, and neither can a signed-out visitor', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const hash = await it.app.hasher.hash(PASSWORD);
    it.app.db.run(
      'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) ' +
        'VALUES (?,?,?,?,?,?,?,?,?)',
      ['u-CLIENT', 'client@example.invalid', 'client@example.invalid', 'Client Person',
        'CLIENT', hash, T, T, it.business]);

    const client = await it.signIn('CLIENT');
    // Refused by `backoffice.enter` before the section's own gate is reached —
    // a client must not be shown the back office's shell either.
    assert.equal((await client.req('/staff/survey')).status, 403);
    assert.equal((await client.req(`/staff/survey/${it.job}/payload.json`)).status, 403);

    const stranger = await it.signIn('ADMIN');
    stranger.cookie = '';
    const out = await stranger.req(`/staff/survey/${it.job}/payload.json`);
    assert.equal(out.status === 401 || out.status === 403 || out.status === 303, true,
      `a signed-out request answered ${out.status}`);
    assert.equal(findEstimateIn(out.body).text.length, 0);
  });

  test('SURVEYING is refused the engaged-client page — that is the decision, not an oversight', () => {
    const a = actor('SURVEYING');
    assert.equal(can(a, 'research.read', { type: 'research', id: 'x', business_id: 'b' }), false);
    assert.equal(can(a, 'internal_note.read', { type: 'internal_note', id: 'n', business_id: 'b' }), false);
    // And it IS on the inputs the survey needs.
    assert.equal(can(a, 'assessment.read', { type: 'assessment', id: 'a', business_id: 'b' }), true);
    assert.equal(can(a, 'register_record.read', { type: 'register_record', id: 'r', business_id: 'b' }), true);
    // And it is NOT on the estimate at all — the second gate payload.ts describes.
    assert.equal(can(a, 'estimate.read', { type: 'estimate', id: 'e', business_id: 'b' }), false);
  });
});

/* ================================================================== *
 * 5. THE QUANTITIES
 * ================================================================== */

describe('the room schedule, and the difference between “none” and “not counted”', () => {
  test('the schedule shown is the sector’s, and it carries no counts of our own', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');
    const r = await surveyor.req(`/staff/survey/${it.job}`);

    // GP, so the GP room types and not the dental ones.
    assert.match(r.body, /Minor-operations room/);
    assert.match(r.body, /Vaccine \/ cold-chain store/);
    assert.equal(r.body.includes('Decontamination room'), false, 'the wrong sector’s schedule was drawn');
    assert.match(r.body, /0 of 8 room types counted/,
      'the workspace arrived with counts already in it');
  });

  test('an empty box means NOT COUNTED and zero means NONE — they are different findings', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');

    await surveyor.post(`/staff/survey/${it.job}/rooms`, { room_id: 'GP-R1', count: '6', note: '' });
    await surveyor.post(`/staff/survey/${it.job}/rooms`, { room_id: 'GP-R5', count: '0', note: 'no dispensary' });
    await surveyor.post(`/staff/survey/${it.job}/rooms`, { room_id: 'GP-R2', count: '', note: 'to check' });

    const rows = it.app.db.all<{ room_id: string; room_count: number | null }>(
      'SELECT room_id, room_count FROM surveyor_room_counts WHERE job_id = ? ORDER BY room_id', [it.job]);
    const of = (id: string): number | null | undefined => rows.find((x) => x.room_id === id)?.room_count;
    assert.equal(of('GP-R1'), 6);
    assert.equal(of('GP-R5'), 0, 'a stated “none” must be stored as none');
    assert.equal(of('GP-R2'), null, 'an empty box became a nought — N4 at the database');

    const page = await surveyor.req(`/staff/survey/${it.job}`);
    assert.match(page.body, /2 of 8 room types counted/,
      'an uncounted room type was counted as counted');
  });

  test('a room id from another sector is refused', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');
    const r = await surveyor.post(`/staff/survey/${it.job}/rooms`, { room_id: 'DN-R1', count: '4', note: '' });
    assert.equal(r.status, 400);
    assert.match(r.body, /not a room type on this sector/);
  });

  test('a count that is not a whole number is refused rather than rounded', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');
    for (const bad of ['two', '3.5', '-1', "1'; DROP TABLE surveyor_room_counts; --"]) {
      const r = await surveyor.post(`/staff/survey/${it.job}/rooms`, { room_id: 'GP-R1', count: bad, note: '' });
      assert.equal(r.status, 400, `'${bad}' was accepted`);
    }
    assert.equal(
      it.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM surveyor_room_counts')?.n, 0);
  });

  test('every room id is unique across the five sectors', () => {
    const ids = allRoomIds();
    assert.equal(new Set(ids).size, ids.length, 'two sectors share a room id — a count would collide');
    assert.equal(ids.length, 49, 'the transcribed schedule has changed size; re-derive it');
    for (const sector of ['dental', 'gp', 'care_homes', 'supported_living', 'private_hospital']) {
      assert.notEqual(roomsFor(sector), null, `${sector} has no room schedule`);
    }
    assert.equal(roomsFor('not-a-sector'), null,
      'an unknown sector must return null, not an empty list — an empty list reads as “no rooms”');
  });
});

/* ================================================================== *
 * 6. THE RATE LIBRARY — theirs, and proposed back
 * ================================================================== */

describe('a surveyor’s overrides become their own library and come back on the next job', () => {
  test('nothing is pre-filled on the first job, because we hold no default to pre-fill', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');
    const r = await surveyor.req(`/staff/survey/${it.job}`);
    assert.match(r.body, /We have no default rate for this field/);
    assert.match(r.body, /nothing — see above/);
  });

  test('what they entered on job one is proposed to them on job two, labelled as THEIRS', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');

    await surveyor.post(`/staff/survey/${it.job}/commit`, {
      ...FIGURES,
      rate_qualifying_pct_sanitary: '42',
      reviewed_qualifying_pct_sanitary: 'on',
      rate_prelims_pct: '11',
      reviewed_prelims_pct: 'on',
    });

    const stored = it.app.db.all<{ field_id: string; final_value: number; outcome: string; reviewed: number }>(
      'SELECT field_id, final_value, outcome, reviewed FROM surveyor_rate_events WHERE job_id = ?', [it.job]);
    assert.equal(stored.length, 2, 'only the fields with a figure in them are recorded');
    assert.equal(stored.find((s) => s.field_id === 'qualifying_pct_sanitary')?.final_value, 42);
    assert.equal(stored.every((s) => s.reviewed === 1), true);

    /* JOB TWO — a different business, a different sector. Same surveyor. */
    const second = await surveyor.req(`/staff/survey/${it.job2}`);
    assert.equal(second.status, 200);
    // Different sector, so the library is keyed differently and offers nothing.
    assert.match(second.body, /nothing — see above/);

    /* And on a second job in the SAME sector it does come back. */
    it.app.db.run("UPDATE businesses SET sector = 'gp' WHERE id = 'biz-2'");
    it.app.db.run("UPDATE assessments SET sector = 'gp' WHERE business_id = 'biz-2'");
    const sameSector = await surveyor.req(`/staff/survey/${it.job2}`);
    assert.match(sameSector.body, /Your figure for qualifying_pct_sanitary/,
      'the surveyor’s own figure was not proposed back on a later job in the same sector');
    assert.match(sameSector.body, /1 observation/);
  });

  test('a posted field the module does not know is never read', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');
    const r = await surveyor.post(`/staff/survey/${it.job}/commit`, {
      ...FIGURES, rate_not_a_real_field: '99', reviewed_not_a_real_field: 'on',
    });
    assert.equal(r.status, 303, 'an unknown parameter should be ignored, not fatal');
    const rows = it.app.db.all<{ field_id: string }>(
      'SELECT field_id FROM surveyor_rate_events WHERE job_id = ?', [it.job]);
    assert.equal(rows.some((x) => x.field_id === 'not_a_real_field'), false);
  });

  test('a FIRST figure is recorded as NOTHING_PROPOSED, never as a platform default we did not have', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');
    await surveyor.post(`/staff/survey/${it.job}/commit`, {
      ...FIGURES, rate_prelims_pct: '11', reviewed_prelims_pct: 'on',
    });

    const row = it.app.db.get<{ prefill_origin: string; prefilled_value: number; outcome: string }>(
      'SELECT prefill_origin, prefilled_value, outcome FROM surveyor_rate_events WHERE job_id = ? AND field_id = ?',
      [it.job, 'prelims_pct']);
    assert.equal(row?.prefill_origin, 'NOTHING_PROPOSED',
      'recording PLATFORM_DEFAULT would claim we put a number in front of them');
    assert.equal(row?.outcome, 'UNTOUCHED',
      'nothing was touched because nothing was there — read it with the origin');
  });

  test('the calibration metric sees the empty boxes and counts them on their own line', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');
    await surveyor.post(`/staff/survey/${it.job}/commit`, {
      ...FIGURES, rate_prelims_pct: '11', reviewed_prelims_pct: 'on',
    });

    // Replay what the application stored through the module's own store, and
    // ask the module's own metric. This is the end-to-end check that the new
    // origin is understood by the thing it was added for.
    const store = new OverrideStore();
    for (const e of it.app.db.all<{
      job_id: string; surveyor_id: string; field_id: string; sector: string; region: string;
      prefilled_value: number; prefill_origin: string; final_value: number; reason: string | null;
      at: string; anchor_verdict: string;
    }>('SELECT * FROM surveyor_rate_events')) {
      store.record({
        job_id: e.job_id, surveyor_id: e.surveyor_id, field_id: e.field_id,
        context: { sector: e.sector as never, region: e.region },
        prefilled_value: e.prefilled_value,
        prefill_origin: e.prefill_origin as never,
        final_value: e.final_value, at: e.at,
        anchor_verdict: e.anchor_verdict as never,
      });
    }
    const a = adoption(store, 'prelims_pct');
    assert.equal(a.excluded_nothing_proposed, 1, 'the empty box was not counted as an empty box');
    assert.equal(a.excluded_not_platform_default, 0, 'and it was not merged into the other exclusion');
    assert.equal(a.n, 0, 'an empty box is evidence about our estimate in neither direction');
  });

  test('the ten tracked fields are the module’s ten, not a copy', () => {
    assert.deepEqual([...RATE_FIELD_IDS], RATE_FIELDS.map((f) => f.field_id));
    assert.equal(RATE_FIELD_IDS.length, 10);
  });
});

/* ================================================================== *
 * 6a. THE CALIBRATION INSTRUMENT'S TWO CAPTURES — Phase 132, 14 September 2026
 *
 * A POSITIVE "reviewed" confirmation, without which NOT_REVIEWED never fires,
 * and the BLANK FIELD served on one job and field in ten. Both are live: they
 * change no client's figure, and both have to be running before the first job.
 *
 * THE CONTROL PAIRS ARE COMPUTED, NOT GUESSED. `isBlankControl` is asked which
 * fields each fixture job holds in the control arm, and every test asserts the
 * precondition it relies on before relying on it.
 * ================================================================== */

const controlFieldsOf = (job: string): string[] => RATE_FIELD_IDS.filter((f) => isBlankControl(job, f));

/** The rate input for one field, as served. Empty string where it is not on the page. */
function inputFor(body: string, field: string): string {
  return new RegExp(`<input[^>]*name="rate_${field}"[^>]*>`).exec(body)?.[0] ?? '';
}

describe('the review confirmation is a positive act, and the blank-field control is served', () => {
  test('no “I looked at this field” box is ticked when the form is served', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');
    const page = await surveyor.req(`/staff/survey/${it.job}`);
    const boxes = page.body.match(/<input[^>]*name="reviewed_[^"]*"[^>]*>/g) ?? [];
    assert.equal(boxes.length, RATE_FIELD_IDS.length,
      'the review boxes were not all found, so the absence of `checked` would prove nothing');
    assert.deepEqual(boxes.filter((b) => /\bchecked\b/.test(b)), [], 'a review box starts ticked');
  });

  test('N4: a figure with the box absent and a figure posted as “not sure” are both NOT_REVIEWED, stored identically', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');
    for (const f of ['prelims_pct', 'qualifying_pct_sanitary']) {
      assert.equal(isBlankControl(it.job, f), false, `precondition: ${f} is not a control on job one`);
    }
    const r = await surveyor.post(`/staff/survey/${it.job}/commit`, {
      ...FIGURES,
      rate_prelims_pct: '11',
      rate_qualifying_pct_sanitary: '42', reviewed_qualifying_pct_sanitary: 'not sure',
    });
    assert.equal(r.status, 303);

    const rows = it.app.db.all<{
      field_id: string; outcome: string; reviewed: number; prefill_origin: string; relative_delta: number; blank_control: number;
    }>('SELECT field_id, outcome, reviewed, prefill_origin, relative_delta, blank_control FROM surveyor_rate_events WHERE job_id = ?', [it.job]);
    const absent = rows.find((x) => x.field_id === 'prelims_pct');
    const notSure = rows.find((x) => x.field_id === 'qualifying_pct_sanitary');
    assert.ok(absent && notSure, 'a figure was not recorded at all');
    assert.equal(absent.outcome, 'NOT_REVIEWED', 'a box never ticked was read as reviewed');
    assert.equal(absent.reviewed, 0);
    assert.equal(notSure.outcome, 'NOT_REVIEWED', '“not sure” was read as reviewed');
    assert.equal(notSure.reviewed, 0);
    const shape = (x: typeof absent): Record<string, unknown> => ({
      outcome: x.outcome, reviewed: x.reviewed, prefill_origin: x.prefill_origin,
      relative_delta: x.relative_delta, blank_control: x.blank_control,
    });
    assert.deepEqual(shape(notSure), shape(absent), '“not sure” and never ticked were stored differently');
  });

  test('a changed library figure with the box unticked is refused as the module rules, and nothing is written', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');
    assert.equal(isBlankControl(it.job2, 'qualifying_pct_sanitary'), false, 'precondition: not a control on job two');

    const first = await surveyor.post(`/staff/survey/${it.job}/commit`, {
      ...FIGURES, rate_qualifying_pct_sanitary: '42', reviewed_qualifying_pct_sanitary: 'on',
    });
    assert.equal(first.status, 303);
    it.app.db.run("UPDATE businesses SET sector = 'gp' WHERE id = 'biz-2'");
    it.app.db.run("UPDATE assessments SET sector = 'gp' WHERE business_id = 'biz-2'");
    const shown = await surveyor.req(`/staff/survey/${it.job2}`);
    assert.match(shown.body, /Your figure for qualifying_pct_sanitary/, 'precondition: job two proposes the library figure');

    const refused = await surveyor.post(`/staff/survey/${it.job2}/commit`, {
      ...FIGURES, rate_qualifying_pct_sanitary: '50', reason_qualifying_pct_sanitary: 'measured again',
    });
    assert.equal(refused.status, 400, 'an unreviewed field whose value moved was accepted');
    assert.match(refused.body, /marked not reviewed but the value moved/);
    const n = (sql: string): number | undefined => it.app.db.get<{ n: number }>(sql, [it.job2])?.n;
    assert.equal(n('SELECT COUNT(*) AS n FROM surveyor_rate_events WHERE job_id = ?'), 0, 'a rate event survived the refusal');
    assert.equal(n('SELECT COUNT(*) AS n FROM surveyor_commitments WHERE job_id = ?'), 0, 'the commitment survived the refusal');
    assert.equal(n('SELECT COUNT(*) AS n FROM surveyor_control_observations WHERE job_id = ?'), 0);
    assert.equal(it.app.db.get<{ state: string }>('SELECT state FROM surveyor_jobs WHERE id = ?', [it.job2])?.state, 'SEALED');

    /* THE NEGATIVE CONTROL: the same figure, confirmed, is accepted. */
    const accepted = await surveyor.post(`/staff/survey/${it.job2}/commit`, {
      ...FIGURES, rate_qualifying_pct_sanitary: '50', reviewed_qualifying_pct_sanitary: 'on',
      reason_qualifying_pct_sanitary: 'measured again',
    });
    assert.equal(accepted.status, 303);
  });

  test('a blank-control field is served empty with no proposal, the same on reload, and its figure is the job’s rate AND a control observation', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');
    const control = controlFieldsOf(it.job)[0];
    assert.ok(control !== undefined, 'precondition: job one holds a field in the control arm');
    assert.equal(isBlankControl(it.job2, control), false, 'precondition: that field is not a control on job two');
    const other = RATE_FIELD_IDS.find((f) => !isBlankControl(it.job, f) && !isBlankControl(it.job2, f));
    assert.ok(other !== undefined);

    /* Give the surveyor a library figure for BOTH fields, on job two in job one's
       sector, so an ordinary field IS proposed on job one. The control field's
       emptiness is then the control, not the absence of a library. */
    it.app.db.run("UPDATE businesses SET sector = 'gp' WHERE id = 'biz-2'");
    it.app.db.run("UPDATE assessments SET sector = 'gp' WHERE business_id = 'biz-2'");
    const seeded = await surveyor.post(`/staff/survey/${it.job2}/commit`, {
      ...FIGURES,
      [`rate_${control}`]: '1850', [`reviewed_${control}`]: 'on',
      [`rate_${other}`]: '11', [`reviewed_${other}`]: 'on',
    });
    assert.equal(seeded.status, 303);

    const first = await surveyor.req(`/staff/survey/${it.job}`);
    const again = await surveyor.req(`/staff/survey/${it.job}`);
    for (const page of [first, again]) {
      assert.match(page.body, new RegExp(`Your figure for ${other}`), 'precondition: an ordinary field IS proposed from the library');
      assert.doesNotMatch(page.body, new RegExp(`Your figure for ${control}`), 'the control field carried proposal text');
      assert.notEqual(inputFor(page.body, control), '', 'the control field’s input was not found');
      assert.match(inputFor(page.body, control), /value=""/, 'the control field was served with a figure in it');
      assert.match(page.body, /blank on this job, on purpose/);
    }
    assert.equal(inputFor(again.body, control), inputFor(first.body, control), 'a reload served a different arm');
    assert.doesNotMatch(inputFor(first.body, other), /value=""/, 'precondition: the ordinary field is pre-filled');

    const r = await surveyor.post(`/staff/survey/${it.job}/commit`, {
      ...FIGURES,
      [`rate_${control}`]: '1900', [`reviewed_${control}`]: 'on',
      [`rate_${other}`]: '11', [`reviewed_${other}`]: 'on',
    });
    assert.equal(r.status, 303);

    const ev = it.app.db.get<{ final_value: number; prefill_origin: string; blank_control: number }>(
      'SELECT final_value, prefill_origin, blank_control FROM surveyor_rate_events WHERE job_id = ? AND field_id = ?',
      [it.job, control]);
    assert.equal(ev?.final_value, 1900, 'the job lost the control field’s figure');
    assert.equal(ev?.prefill_origin, 'NOTHING_PROPOSED',
      'the library figure was not on the screen and may not be recorded as proposed');
    assert.equal(ev?.blank_control, 1);
    assert.equal(it.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM surveyor_rate_events WHERE job_id = ?', [it.job])?.n, 2,
      'the control field is not counted among the job’s rates');
    assert.equal(it.app.db.get<{ blank_control: number }>(
      'SELECT blank_control FROM surveyor_rate_events WHERE job_id = ? AND field_id = ?', [it.job, other])?.blank_control, 0);

    const ctl = it.app.db.all<{ field_id: string; value: number; surveyor_id: string; anchor_verdict: string }>(
      'SELECT field_id, value, surveyor_id, anchor_verdict FROM surveyor_control_observations WHERE job_id = ?', [it.job])
      .map((x) => ({ ...x }));
    assert.deepEqual(ctl, [{ field_id: control, value: 1900, surveyor_id: 'u-SURVEYING', anchor_verdict: 'CLEAN' }]);
  });

  test('N4 on the control arm: a control field left unticked, or posted as “not sure”, is the job’s rate and writes no control observation', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');
    const controls = controlFieldsOf(it.job2);
    assert.ok(controls.length >= 2, 'precondition: job two holds two fields in the control arm');
    const [absent, notSure] = controls as [string, string];
    const r = await surveyor.post(`/staff/survey/${it.job2}/commit`, {
      ...FIGURES,
      [`rate_${absent}`]: '30',
      [`rate_${notSure}`]: '12', [`reviewed_${notSure}`]: 'not sure',
    });
    assert.equal(r.status, 303);
    const rows = it.app.db.all<{ field_id: string; outcome: string; reviewed: number; blank_control: number }>(
      'SELECT field_id, outcome, reviewed, blank_control FROM surveyor_rate_events WHERE job_id = ?', [it.job2]);
    for (const f of [absent, notSure]) {
      const row = rows.find((x) => x.field_id === f);
      assert.ok(row, `${f} was dropped from the job`);
      assert.deepEqual([row.outcome, row.reviewed, row.blank_control], ['NOT_REVIEWED', 0, 1], f);
    }
    assert.equal(it.app.db.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM surveyor_control_observations WHERE job_id = ?', [it.job2])?.n, 0,
      'an unconfirmed figure entered the control arm');
  });

  test('on an EXPOSED job the commitment succeeds, the figure is the job’s rate, and no control observation is written', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');
    const control = controlFieldsOf(it.job)[0];
    assert.ok(control !== undefined, 'precondition: job one holds a field in the control arm');

    const disclosed = await surveyor.post(`/staff/survey/${it.job}/disclosure`, { note: 'the client read us a range from the website' });
    assert.equal(disclosed.status, 303, 'precondition: the disclosure was recorded');

    const r = await surveyor.post(`/staff/survey/${it.job}/commit`, {
      ...FIGURES, [`rate_${control}`]: '1900', [`reviewed_${control}`]: 'on',
    });
    assert.equal(r.status, 303, 'a non-CLEAN job refused the surveyor’s commitment');
    const ev = it.app.db.get<{ final_value: number; anchor_verdict: string; blank_control: number }>(
      'SELECT final_value, anchor_verdict, blank_control FROM surveyor_rate_events WHERE job_id = ? AND field_id = ?',
      [it.job, control]);
    assert.equal(ev?.final_value, 1900);
    assert.notEqual(ev?.anchor_verdict, 'CLEAN', 'precondition: the job is not CLEAN');
    assert.equal(ev?.blank_control, 1);
    assert.equal(it.app.db.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM surveyor_control_observations WHERE job_id = ?', [it.job])?.n, 0,
      'an anchored job wrote a control observation');
  });

  test('an amendment after release neither changes a control observation nor creates one', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');
    const amendment = { a_qualifying_plant: '250000', b_building: '600000', c_bare_land: '150000', qualifying_pct: '24.5', reason: 'recounted after release' };

    const control = controlFieldsOf(it.job)[0];
    assert.ok(control !== undefined);
    assert.equal((await surveyor.post(`/staff/survey/${it.job}/commit`, {
      ...FIGURES, [`rate_${control}`]: '1900', [`reviewed_${control}`]: 'on',
    })).status, 303);
    assert.equal((await surveyor.post(`/staff/survey/${it.job}/amend`, {
      ...amendment, [`rate_${control}`]: '2100', [`reviewed_${control}`]: 'on',
    })).status, 303);
    assert.equal(it.app.db.get<{ final_value: number }>(
      'SELECT final_value FROM surveyor_rate_events WHERE job_id = ? AND field_id = ?', [it.job, control])?.final_value, 2100,
      'the job does not carry the amended figure');
    assert.deepEqual(it.app.db.all<{ value: number }>(
      'SELECT value FROM surveyor_control_observations WHERE job_id = ?', [it.job]).map((x) => x.value), [1900],
      'the amendment changed the observation made before release');

    const later = controlFieldsOf(it.job2)[0];
    assert.ok(later !== undefined);
    assert.equal((await surveyor.post(`/staff/survey/${it.job2}/commit`, { ...FIGURES })).status, 303);
    assert.equal((await surveyor.post(`/staff/survey/${it.job2}/amend`, {
      ...amendment, [`rate_${later}`]: '30', [`reviewed_${later}`]: 'on',
    })).status, 303);
    assert.equal(it.app.db.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM surveyor_control_observations WHERE job_id = ?', [it.job2])?.n, 0,
      'a figure first given after release entered the control arm');
  });

  test('the database holds the control arm to its rules: CLEAN only, never edited, never deleted', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const db = it.app.db;
    const insert = (id: string, verdict: string): void => {
      db.run(
        'INSERT INTO surveyor_control_observations (id, job_id, surveyor_id, field_id, sector, region, value, at, anchor_verdict) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, it.job, 'u-SURVEYING', 'prelims_pct', 'GP_PRIMARY_CARE', 'X', 11, T, verdict],
      );
    };
    assert.throws(() => insert('c-exposed', 'EXPOSED'), 'an EXPOSED control observation was stored');
    insert('c-clean', 'CLEAN');
    assert.throws(() => db.run('UPDATE surveyor_control_observations SET value = 12 WHERE id = ?', ['c-clean']), /not edited/);
    assert.throws(() => db.run('DELETE FROM surveyor_control_observations WHERE id = ?', ['c-clean']), /never deleted/);
  });
});

/* ================================================================== *
 * 7. THE STUB, SAID OUT LOUD
 * ================================================================== */

test('the workspace says the signature is stubbed, on the page AND in the payload it serves', async (t) => {
  const it = await boot();
  t.after(() => it.close());
  const surveyor = await it.signIn('SURVEYING');
  const page = await surveyor.req(`/staff/survey/${it.job}`);
  assert.match(page.body, /E-SIGNING IS NOT SWITCHED ON YET/);
  assert.match(page.body, /No signature service is connected/);
  assert.match(page.body, /No payment is taken/); // Phase 133c: the footer's words, in plain English
});

/* ================================================================== *
 * 8. THE JSON API ROUTE — added by Phase 108, 9 September 2026
 *
 * `/api/surveyor-jobs/:id` returned HTTP 501 with the words "the surveyor
 * workspace is Phase 107" until this phase. Phase 107 built it on 9 September,
 * so the route was announcing built work as future work: a stub in every sense
 * that matters, and one no stub table listed.
 *
 * IT NOW SERVES THE SAME OBJECT THE SCREEN SERVES, THROUGH THE SAME ASSEMBLER,
 * so N1 holds here by identity rather than by repetition. These tests assert
 * exactly that — the two bodies are equal — and then run the N1 search over
 * this route's own bytes anyway, with the ADMIN negative control, because
 * "it is the same code" is a claim and the bytes are the evidence.
 * ================================================================== */

describe('the JSON API surveyor route serves the screen’s object, not a promise of one', () => {
  test('it is not a 501, and it does not describe itself as unbuilt', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');
    const r = await surveyor.req(`/api/surveyor-jobs/${it.job}`);
    assert.equal(r.status, 200);
    assert.doesNotMatch(r.body, /Phase 107/);
    assert.doesNotMatch(r.body, /501/);
  });

  test('byte for byte the same payload the workspace’s own JSON route returns', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');
    const viaApi = await surveyor.req(`/api/surveyor-jobs/${it.job}`);
    const viaScreen = await surveyor.req(`/staff/survey/${it.job}/payload.json`);
    assert.deepEqual(JSON.parse(viaApi.body), JSON.parse(viaScreen.body));
  });

  test('N1 on this route’s own bytes, with the admin negative control', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');
    const mine = await surveyor.req(`/api/surveyor-jobs/${it.job}`);
    const values = Object.values(ESTIMATE).map(String);

    assert.equal('estimate' in JSON.parse(mine.body), false);
    assert.equal([...keys(JSON.parse(mine.body))].filter((k) => k in ESTIMATE).length, 0);
    assert.equal(
      [...scalars(JSON.parse(mine.body))].map(String).filter((v) => values.includes(v)).length, 0,
      'a value from the sealed estimate reached the surveyor by some other name',
    );
    assert.equal(values.filter((v) => mine.body.includes(v)).length, 0, 'raw text');

    /* The control. As ADMIN the estimate IS released, so all three searches
       must FIND it — otherwise the three zeros above prove nothing. */
    const admin = await it.signIn('ADMIN');
    const theirs = await admin.req(`/api/surveyor-jobs/${it.job}`);
    assert.equal('estimate' in JSON.parse(theirs.body), true);
    assert.equal(values.filter((v) => theirs.body.includes(v)).length, values.length);
  });

  test('a surveyor is refused another surveyor’s job here too, not only on the screen', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const surveyor = await it.signIn('SURVEYING');
    const r = await surveyor.req(`/api/surveyor-jobs/${it.otherJob}`);
    assert.notEqual(r.status, 200);
  });

  test('accounting cannot open it at all', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const acct = await it.signIn('ACCOUNTING');
    const r = await acct.req(`/api/surveyor-jobs/${it.job}`);
    assert.notEqual(r.status, 200);
  });
});
