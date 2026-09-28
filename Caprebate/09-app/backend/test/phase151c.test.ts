/**
 * PHASE 151c, 25 September 2026 — THE SITE AREA'S CALLER AND ITS SCREEN, ALL OF IT SWITCHED OFF; OS'S GRID FILE'S
 * CHECKING TOOL; THE LICENCE ROW AND THE BOUNDARY MODULE SAYING THE SAME THING; ACCOUNTING'S HELP LINK.
 *
 * With NO NETWORK and on INVENTED data only (the land boundary files, the grid and every point are made up):
 *
 *   1. THE CALLER — "Run the research" is the one caller of siteAreaFromLandBoundary (src/web/site-area-run.ts). As
 *      shipped it reads, sends and stores nothing, and every property's line says the site area is switched off.
 *      Switched on for a test with the gates open it passes the council and the point on, stores through the one door,
 *      and gives one line in words for every state. Nothing refuses and nothing throws.
 *   2. THE SCREEN — a point and a neighbouring council on the property page (src/web/site-area-inputs.ts): Admin or
 *      Sales, after signing only, kept with who and when, audited, and passed on by the research run.
 *   3. THE GRID FILE'S TOOL — tools/ostn15-verify.ts on a generated, invented full grid in a temporary folder: 0 when
 *      every point agrees, 1 when one does not, 2 — a plain sentence, no stack trace — when nothing could be checked.
 *   4. THE WORDS THAT DISAGREED — the licence row and checkBoundaryUse now both keep the site area for our own checks.
 *   8. ACCOUNTING'S HELP LINK — the Clients tab names B55 for a login that sees the billing view.
 */
/* PHASE 151j: this file tests other things through a password sign-in, so it builds the application with
   twoFactor: 'off'. The second step itself is proved in test/phase151j.test.ts, on the default (staff must). */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, createWriteStream } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import type { Actor } from '../src/authz.ts';
import { fixtureTransport, RateLimiter, type Fixture } from '../src/connectors/http.ts';
import { projectNationalGrid, GRS80, OSTN15_COLUMNS, OSTN15_ROWS } from '../src/connectors/ostn15.ts';
import { BOUNDARY_FETCHING_SWITCHED_ON, checkBoundaryUse } from '../../../04-phase-work/phase9/caprebate-boundary-import.ts';
import { LICENCES } from '../../../04-phase-work/phase3/caprebate-source-register.ts';
import * as R from '../src/web/research.ts';
import { runSiteAreas, siteAreaLines, storeSiteAreaRuns, siteAreaWaits, type SiteAreaGates, type SiteAreaLine } from '../src/web/site-area-run.ts';
import { enterSitePoint, addNeighbourCouncil, metres } from '../src/web/site-area-inputs.ts';
import { NOT_BUILT } from '../src/connectors/free-registers.ts';
import { DECLINED_LINE } from '../src/web/address-check.ts';
import { helpScreenFor } from '../src/web/navigation.ts';
import { newId } from '../src/users.ts';
import { zipOf } from './document-fixtures.ts';
import { keys, scalars } from './helpers.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const BACKEND = join(HERE, '..');

/* ================================================================== the invented land boundary files (as Phase 151a's) */

const poly = (id: string, x0: number, y0: number, x1: number, y1: number): string =>
  `<wfs:member><LR:PREDEFINED><LR:GEOMETRY><gml:Polygon srsName="urn:ogc:def:crs:EPSG::27700"><gml:exterior><gml:LinearRing>` +
  `<gml:posList srsDimension="2">${x0} ${y0} ${x1} ${y0} ${x1} ${y1} ${x0} ${y1} ${x0} ${y0}</gml:posList></gml:LinearRing>` +
  `</gml:exterior></gml:Polygon></LR:GEOMETRY><LR:INSPIREID>${id}</LR:INSPIREID></LR:PREDEFINED></wfs:member>`;
const gmlZip = (...members: string[]): Buffer => zipOf([{
  name: 'Land_Registry_Cadastral_Parcels.gml',
  body: `<?xml version="1.0"?><!-- INVENTED for Caprebate's tests. --><wfs:FeatureCollection xmlns:wfs="w" xmlns:gml="g" xmlns:LR="l">${members.join('')}</wfs:FeatureCollection>`,
}]);
const ADUR = gmlZip(poly('99151c01', 520000, 180000, 520100, 180100), poly('99151c02', 521000, 181000, 521050, 181040));
const WORTHING_SAME = gmlZip(poly('99151c01', 520000, 180000, 520100, 180100));
const ADUR_ELSEWHERE = gmlZip(poly('99151c09', 600000, 300000, 600010, 300010));
const ADUR_CODE = 'E07000223';
const WORTHING_CODE = 'E07000229';
const path = (file: string): string => `GET /datasets/inspire/download/${file}.zip`;
const zipOk = (bytes: Buffer): Fixture => ({ status: 200, body: '', bytes, headers: { 'content-type': 'application/zip' } });
const OPEN: SiteAreaGates = { free_gate_open: true, engagement_signed: true, declined: false };
const NOW = '2026-09-25T10:00:00.000Z';

/* ================================================================== a seeded app, and a running one over HTTP */

type Res = { status: number; body: string };
function client(base: string) {
  let cookie = '';
  const req = async (p: string, init: RequestInit = {}): Promise<Res> => {
    const headers = { ...(init.headers as Record<string, string> | undefined) };
    if (cookie !== '') headers['cookie'] = cookie;
    const r = await fetch(base + p, { redirect: 'manual', ...init, headers });
    const set = r.headers.getSetCookie();
    if (set.length > 0) cookie = set.map((x) => x.split(';')[0] ?? '').join('; ');
    return { status: r.status, body: await r.text() };
  };
  return {
    get: (p: string) => req(p),
    post: (p: string, fields: Record<string, string>) =>
      req(p, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() }),
  };
}

let clock = 0;
async function world(opts: { listen?: boolean } = {}) {
  const made = await createApp(':memory:', { twoFactor: 'off',
    documentRoot: mkdtempSync(join(tmpdir(), 'cb-151c-')), sealKey: randomBytes(32),
    now: () => new Date(Date.parse(NOW) + clock++ * 1000).toISOString(),
  });
  let base = '';
  if (opts.listen === true) {
    await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
    const addr = made.server.address();
    base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  }
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  const db = made.app.db;
  const who = (role: string): Actor => ({ id: s.users.find((u) => u.role === role)!.id, role, business_id: null, disabled: false } as Actor);
  const businessWith = (state: string) => db.get<{ business_id: string }>(
    'SELECT business_id FROM engagements WHERE letter_state = ? ORDER BY business_id LIMIT 1', [state])!.business_id;
  const signed = businessWith('SIGNED');
  const unsigned = businessWith('NOT_SENT');
  /** An invented property of our own on a company, with no postcode, so its council is only what a person adds. */
  const property = (business_id: string, label = 'Invented Site 151c'): string => {
    const id = newId();
    db.run('INSERT INTO properties (id, business_id, label, created_at) VALUES (?, ?, ?, ?)', [id, business_id, label, NOW]);
    return id;
  };
  const deps = { db, audit: made.app.audit, now: made.app.now, newId };
  const audit = (kind: string) => db.all<{ object_id: string; detail: string }>('SELECT object_id, detail FROM audit_log WHERE kind = ? ORDER BY seq', [kind]);
  const signIn = async (email: string) => {
    const c = client(base);
    assert.equal((await c.post('/login', { email, password: s.password })).status, 303, `${email} could not sign in`);
    return c;
  };
  const records = () => db.all<{ entity_id: string; fields_json: string }>("SELECT entity_id, fields_json FROM register_records WHERE source_id = 'HMLR_INSPIRE'");
  return { made, app: made.app, db, who, signed, unsigned, property, deps, audit, signIn, records, close: made.close };
}
type World = Awaited<ReturnType<typeof world>>;

const lineFor = (lines: readonly SiteAreaLine[], property_id: string): SiteAreaLine => {
  const l = lines.find((x) => x.property_id === property_id);
  assert.ok(l, 'no line for the property');
  return l;
};

/** One click's site area, stored as runResearch stores it. */
async function click(w: World, business_id: string, fixtures: Record<string, Fixture>, gates: SiteAreaGates = OPEN, switched_on = true) {
  const t = fixtureTransport(fixtures);
  const admin = w.who('ADMIN');
  const lines = await runSiteAreas(w.deps, admin, business_id, gates,
    { transport: t, limiter: new RateLimiter(), sleep: async () => { /* no wait */ } },
    { switched_on, postcodeStore: null, grid: null, fileStore: null });
  const at = w.app.now();
  w.db.tx(() => storeSiteAreaRuns(w.deps, admin, business_id, lines, at));
  return { t, lines };
}

/* ================================================================== 1 · the caller */

describe('Phase 151c, line 1: "Run the research" is the site area\'s caller — and as shipped it does nothing', () => {
  test('the switch is still false; a click on a signed client sends nothing, stores nothing, and each property\'s line says it is switched off', async () => {
    assert.equal(BOUNDARY_FETCHING_SWITCHED_ON, false);
    const w = await world();
    try {
      const p = w.property(w.signed);
      assert.equal(enterSitePoint(w.deps, w.who('ADMIN'), p, { easting: '520050', northing: '180050' }).ok, true);
      assert.equal(addNeighbourCouncil(w.deps, w.who('ADMIN'), p, ADUR_CODE, null).ok, true);
      const t = fixtureTransport({ [path('Adur_District_Council')]: zipOk(ADUR) });
      const run = await R.runResearch({ ...w.deps, outside: { transport: t, secrets: { get: () => null } as never, limiter: new RateLimiter(), postcodeStore: null } }, w.who('ADMIN'), w.signed);
      assert.equal(run.ok, true, run.why);
      assert.equal(t.seen.length, 0, 'a request left the server');
      const mine = lineFor(run.site_area ?? [], p);
      assert.equal(mine.state, 'SWITCHED_OFF');
      assert.match(mine.words, /switched off/);
      assert.match(mine.words, /site area stays asked/);
      assert.equal(w.records().length, 0);
      assert.equal(w.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM site_area_runs')?.n, 0, 'a switched-off line was kept');
      // The panel says the same, drawn without a call, and the land boundary's own row points at the lines.
      const panel = R.sourcesFor(w.db, w.who('ADMIN'), w.signed, { site: { postcodeStore: null } });
      assert.equal(lineFor(panel.site_area, p).state, 'SWITCHED_OFF');
      assert.match(panel.sources.find((x) => x.source_id === 'HMLR_INSPIRE')?.detail ?? '', /free lookups wait|site area lines/);
      assert.match(NOT_BUILT['HMLR_INSPIRE'] ?? '', /site area lines/);
    } finally { w.close(); }
  });

  test('switched on for a test with the gates open: the council a person added and the point a person entered are passed on, one GET, stored through the one door', async () => {
    const w = await world();
    try {
      const p = w.property(w.signed);
      enterSitePoint(w.deps, w.who('SALES'), p, { easting: '520 050', northing: '180,050' });
      addNeighbourCouncil(w.deps, w.who('SALES'), p, ADUR_CODE, null);
      const { t, lines } = await click(w, w.signed, { [path('Adur_District_Council')]: zipOk(ADUR) });
      assert.equal(t.seen.length, 1);
      const mine = lineFor(lines, p);
      assert.equal(mine.state, 'STORED', mine.words);
      assert.equal(mine.site_area_m2, 10000);
      assert.equal(mine.grade, 'B');
      assert.match(mine.words, /10000 square metres/);
      assert.match(mine.words, /point entered on the property page/);
      const rec = w.records();
      assert.equal(rec.length, 1);
      assert.equal(rec[0]!.entity_id, `property:${p}`);
      assert.equal(JSON.parse(rec[0]!.fields_json).inspire_id, '99151c01');
      // No polygon, map or coordinate in what a caller is told: only the point a person typed exists anywhere.
      assert.ok(![...keys(lines)].some((k) => /geometry|coordinates|polygon|ring|easting|northing|map/i.test(k)));
      assert.ok(![...scalars(lines)].some((v) => v === 520000 || v === 520100 || v === 180100));
      // Kept, so the panel still says it after the page reloads — and a second click reads nothing.
      assert.equal(lineFor(siteAreaLines(w.db, w.signed, OPEN, { switched_on: true, postcodeStore: null }), p).state, 'STORED');
      const again = await click(w, w.signed, { [path('Adur_District_Council')]: zipOk(ADUR) });
      assert.equal(again.t.seen.length, 0);
      assert.equal(lineFor(again.lines, p).state, 'ALREADY_HELD');
    } finally { w.close(); }
  });

  test('a site on a council boundary: both councils\' files are read, and the line says so', async () => {
    const w = await world();
    try {
      const p = w.property(w.signed);
      enterSitePoint(w.deps, w.who('ADMIN'), p, { easting: '520050', northing: '180050' });
      addNeighbourCouncil(w.deps, w.who('ADMIN'), p, ADUR_CODE, null);
      addNeighbourCouncil(w.deps, w.who('ADMIN'), p, WORTHING_CODE, null);
      const { t, lines } = await click(w, w.signed, {
        [path('Adur_District_Council')]: zipOk(ADUR), [path('Worthing_Borough_Council')]: zipOk(WORTHING_SAME),
      });
      assert.equal(t.seen.length, 2);
      const mine = lineFor(lines, p);
      assert.equal(mine.state, 'STORED');
      assert.match(mine.words, /We read the files of Adur and Worthing/);
    } finally { w.close(); }
  });

  test('a person\'s point is used before Homedata\'s; Homedata\'s own easting and northing are used when nobody entered one; its latitude and longitude are refused', async () => {
    const w = await world();
    try {
      const p = w.property(w.signed);
      addNeighbourCouncil(w.deps, w.who('ADMIN'), p, ADUR_CODE, null);
      const homedata = (fields: Record<string, unknown>) => w.db.run(
        'INSERT INTO register_records (id, business_id, source_id, entity_id, fields_json, obtained_at, property_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [newId(), w.signed, 'HOMEDATA_ADDRESS', `hd:${newId()}`, JSON.stringify(fields), w.app.now(), p]);
      homedata({ latitude: 50.83, longitude: -0.32 });
      const refused = lineFor(siteAreaLines(w.db, w.signed, OPEN, { switched_on: true, postcodeStore: null }), p);
      assert.equal(refused.state, 'NO_POINT');
      assert.match(refused.words, /ETRS89/);
      assert.match(refused.words, /enter its easting and northing on the property page/);
      homedata({ easting: 521025, northing: 181020 });
      const ready = lineFor(siteAreaLines(w.db, w.signed, OPEN, { switched_on: true, postcodeStore: null }), p);
      assert.equal(ready.state, 'READY', ready.words);
      assert.match(ready.words, /paid address lookup/);
      // A person enters a point: theirs is used, and it is the other polygon.
      enterSitePoint(w.deps, w.who('ADMIN'), p, { easting: '520050', northing: '180050' });
      const { lines } = await click(w, w.signed, { [path('Adur_District_Council')]: zipOk(ADUR) });
      assert.equal(lineFor(lines, p).state, 'STORED');
      assert.equal(JSON.parse(w.records()[0]!.fields_json).inspire_id, '99151c01');
    } finally { w.close(); }
  });

  test('one line in words for every state, and nothing refuses and nothing throws', async () => {
    const w = await world();
    try {
      const p = w.property(w.signed);
      const lines = (gates: SiteAreaGates, on = true) => lineFor(siteAreaLines(w.db, w.signed, gates, { switched_on: on, postcodeStore: null }), p);
      const said: string[] = [];
      const see = (l: SiteAreaLine, state: string, re: RegExp) => {
        assert.equal(l.state, state, l.words); assert.match(l.words, re); assert.doesNotMatch(l.words, /undefined|null|NaN|\[object/); said.push(l.words);
      };
      see(lines(OPEN, false), 'SWITCHED_OFF', /switched off/);
      see(lines({ ...OPEN, declined: true }), 'WAITING', new RegExp(DECLINED_LINE.slice(0, 20)));
      see(lines({ ...OPEN, engagement_signed: false }), 'WAITING', /engagement letter is signed/);
      see(lines({ ...OPEN, free_gate_open: false }), 'WAITING', /privacy notice is published/);
      see(lines(OPEN), 'NO_POINT', /no point/);
      enterSitePoint(w.deps, w.who('ADMIN'), p, { easting: '520050', northing: '180050' });
      see(lines(OPEN), 'NO_COUNCIL', /which council/);
      addNeighbourCouncil(w.deps, w.who('ADMIN'), p, ADUR_CODE, null);
      see(lines(OPEN), 'READY', /next time the research is run/);
      // Not found: kept, and said again after a reload.
      const miss = await click(w, w.signed, { [path('Adur_District_Council')]: zipOk(ADUR_ELSEWHERE) });
      see(lineFor(miss.lines, p), 'NOT_FOUND', /No freehold polygon/);
      const reloaded = lines(OPEN);
      assert.equal(reloaded.state, 'NOT_FOUND');
      assert.equal(reloaded.words, lineFor(miss.lines, p).words, 'the panel does not say what the click found');
      // A download that fails is not found too — a state, not an error.
      const p2 = w.property(w.signed, 'Second Invented Site');
      enterSitePoint(w.deps, w.who('ADMIN'), p2, { easting: '521025', northing: '181020' });
      addNeighbourCouncil(w.deps, w.who('ADMIN'), p2, ADUR_CODE, null);
      const broke = await click(w, w.signed, { [path('Adur_District_Council')]: { status: 500, body: 'invented failure' } });
      assert.equal(lineFor(broke.lines, p2).state, 'NOT_FOUND');
      assert.equal(w.records().length, 0);
      assert.equal(new Set(said).size, said.length, 'two states share the same words');
      assert.equal(siteAreaWaits(OPEN), null);
    } finally { w.close(); }
  });
});

/* ================================================================== 2 · the screen */

describe('Phase 151c, line 2: the point and the neighbouring council on the property page', () => {
  test('Admin and Sales, once the letter is signed: kept with who and when, audited, and shown on the property page and the research panel', async () => {
    const w = await world({ listen: true });
    try {
      const p = w.property(w.signed);
      const admin = await w.signIn('admin@example.invalid');
      const page = await admin.get(`/staff/properties/${p}`);
      assert.equal(page.status, 200);
      assert.match(page.body, /Where the site is, for its area/);
      assert.match(page.body, /action="\/staff\/properties\/[^"]+\/site-point"/);
      assert.match(page.body, /action="\/staff\/properties\/[^"]+\/site-council"/);
      assert.equal((await admin.post(`/staff/properties/${p}/site-point`, { easting: '520050', northing: '180050' })).status, 303);
      const sales = await w.signIn('sales@example.invalid');
      assert.equal((await sales.post(`/staff/properties/${p}/site-council`, { lad_code: WORTHING_CODE })).status, 303);
      const rows = w.db.all<{ kind: string; easting: number | null; lad_code: string | null; entered_by: string; entered_at: string }>(
        'SELECT kind, easting, lad_code, entered_by, entered_at FROM site_area_inputs WHERE property_id = ? ORDER BY rowid', [p]);
      assert.deepEqual(rows.map((r) => [r.kind, r.easting, r.lad_code, r.entered_by]),
        [['POINT', 520050, null, w.who('ADMIN').id], ['NEIGHBOUR_COUNCIL', null, WORTHING_CODE, w.who('SALES').id]]);
      assert.ok(rows.every((r) => /^2026-09-25T/.test(r.entered_at)));
      assert.equal(w.audit('SITE_POINT_ENTERED').length, 1);
      assert.equal(w.audit('SITE_COUNCIL_ADDED').length, 1);
      assert.match(w.audit('SITE_COUNCIL_ADDED')[0]!.detail, new RegExp(WORTHING_CODE));
      const after = await admin.get(`/staff/properties/${p}`);
      assert.match(after.body, /Easting 520050, northing 180050\. Entered by Admin User/);
      assert.match(after.body, /Worthing \(added by Sales User/);
      const clientPage = await admin.get(`/staff/clients/${w.signed}`);
      assert.match(clientPage.body, /Site area, <a href="\/staff\/properties\/[^"]+#site-point">Invented Site 151c<\/a>: /);
      // Kept as entered: a row cannot be changed or removed.
      assert.throws(() => w.db.run('UPDATE site_area_inputs SET easting = 1 WHERE property_id = ?', [p]));
      assert.throws(() => w.db.run('DELETE FROM site_area_inputs WHERE property_id = ?', [p]));
    } finally { w.close(); }
  });

  test('before the letter is signed there is no form, and a post is refused in words with nothing saved', async () => {
    const w = await world({ listen: true });
    try {
      const p = w.property(w.unsigned);
      const admin = await w.signIn('admin@example.invalid');
      const page = await admin.get(`/staff/properties/${p}`);
      assert.doesNotMatch(page.body, /\/site-point"/);
      assert.match(page.body, /You can enter this once the engagement letter is signed\./);
      const r = await admin.post(`/staff/properties/${p}/site-point`, { easting: '520050', northing: '180050' });
      assert.equal(r.status, 400);
      assert.match(r.body, /once the engagement letter is signed/);
      assert.equal(w.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM site_area_inputs')?.n, 0);
      assert.equal(w.audit('SITE_POINT_ENTERED').length, 0);
    } finally { w.close(); }
  });

  test('the surveyor and Accounting cannot enter either, and nothing is saved', async () => {
    const w = await world({ listen: true });
    try {
      const p = w.property(w.signed);
      for (const email of ['surveying@example.invalid', 'accounting@example.invalid']) {
        const c = await w.signIn(email);
        assert.equal((await c.post(`/staff/properties/${p}/site-point`, { easting: '520050', northing: '180050' })).status, 403, email);
        assert.equal((await c.post(`/staff/properties/${p}/site-council`, { lad_code: ADUR_CODE })).status, 403, email);
      }
      assert.equal(w.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM site_area_inputs')?.n, 0);
    } finally { w.close(); }
  });

  test('N4 and bad input: blank, "not sure", text, outside the grid, an unknown council and one added twice are refused in words, nothing saved', async () => {
    const w = await world();
    try {
      const p = w.property(w.signed);
      const a = w.who('ADMIN');
      for (const [e, n] of [['', '180050'], ['not sure', '180050'], ['520050', undefined], ['abc', 'def'], ['800000', '180050'], ['-5', '180050']] as const) {
        const r = enterSitePoint(w.deps, a, p, { easting: e, northing: n ?? null });
        assert.equal(r.ok, false, `${e} ${String(n)}`);
        if (!r.ok) assert.match(r.why, /Nothing was saved/);
      }
      assert.equal(metres(undefined), null);
      assert.equal(metres('not sure'), null);
      for (const code of ['', 'not sure', 'E99999999', undefined]) {
        const r = addNeighbourCouncil(w.deps, a, p, code, null);
        assert.equal(r.ok, false, String(code));
      }
      assert.equal(addNeighbourCouncil(w.deps, a, p, ADUR_CODE, null).ok, true);
      const twice = addNeighbourCouncil(w.deps, a, p, ADUR_CODE, null);
      assert.equal(twice.ok, false);
      if (!twice.ok) assert.match(twice.why, /already added/);
      assert.equal(w.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM site_area_inputs WHERE property_id = ?', [p])?.n, 1);
    } finally { w.close(); }
  });
});

/* ================================================================== 3 · the grid file's checking tool */

describe('Phase 151c, line 3: tools/ostn15-verify.ts on a generated, invented full grid', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cb-151c-ostn15-'));
  const gridFile = join(dir, 'invented-grid.txt');
  /* Shifts that vary linearly across the grid, so the bilinear interpolation must be right to agree; a strip in the
     far east is marked outside the transformation's area (datum flag 0). INVENTED: these are not OS's shifts. */
  const se = (e: number) => 90 + e / 1e5;
  const sn = (n: number) => -80 - n / 2e5;
  const OUTSIDE_FROM_KM = 690;
  const writeGrid = async (file: string, rows: number) => {
    const out = createWriteStream(file);
    const put = (s: string) => new Promise<void>((r) => { if (out.write(s)) r(); else out.once('drain', () => r()); });
    await put('Point_ID,ETRS89_Easting,ETRS89_Northing,ETRS89_OSGB36_EShift,ETRS89_OSGB36_NShift,ETRS89_ODN_HeightShift,Height_Datum_Flag\n');
    let id = 1; let chunk = '';
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < OSTN15_COLUMNS; i++) {
        const e = i * 1000; const n = j * 1000;
        chunk += `${id++},${e},${n},${se(e).toFixed(6)},${sn(n).toFixed(6)},50.000,${i >= OUTSIDE_FROM_KM ? 0 : 1}\n`;
      }
      if (chunk.length > 1 << 20) { await put(chunk); chunk = ''; }
    }
    await put(chunk);
    await new Promise<void>((r) => out.end(() => r()));
  };
  const POINTS = [
    { id: 'IP01', lat: 50.83, lon: -0.32 }, { id: 'IP02', lat: 52.6580, lon: 1.7161 }, { id: 'IP03', lat: 57.1, lon: -4.2 },
    { id: 'IP04', lat: 51.4, lon: -3.2 }, { id: 'IP05', lat: 52.6, lon: 2.35 }, // IP05 lies in the invented flag-0 strip
  ];
  const expected = (lat: number, lon: number) => {
    const p = projectNationalGrid(lat, lon, GRS80);
    return { e: Math.round((p.easting + se(p.easting)) * 1000) / 1000, n: Math.round((p.northing + sn(p.northing)) * 1000) / 1000, east_km: p.easting / 1000 };
  };
  const tool = (g: string, i: string, o: string) => spawnSync(process.execPath, [join(BACKEND, 'tools', 'ostn15-verify.ts'), g, i, o], { encoding: 'utf8', timeout: 120_000 });
  const inFile = join(dir, 'in.txt');
  const outFile = (name: string, bump = 0, drop = false) => {
    const f = join(dir, name);
    writeFileSync(f, (drop ? 'PointID,OSGBEast,Height\n' : 'PointID,OSGBEast,OSGBNorth\n') + POINTS.map((p, k) => {
      const x = expected(p.lat, p.lon);
      if (x.east_km >= OUTSIDE_FROM_KM - 1) return `${p.id},,`; // Ordnance Survey gives no answer here
      return `${p.id},${(x.e + (k === 0 ? bump : 0)).toFixed(3)},${x.n.toFixed(3)}`;
    }).join('\n') + '\n');
    return f;
  };

  test('0 when every point agrees and the one outside the area is refused alike; 1 when one point is 2 mm out', async () => {
    await writeGrid(gridFile, OSTN15_ROWS);
    writeFileSync(inFile, 'PointID,ETRS89 Latitude,ETRS Longitude\n' + POINTS.map((p) => `${p.id},${p.lat},${p.lon}`).join('\n') + '\n');
    const good = tool(gridFile, inFile, outFile('good.txt'));
    assert.equal(good.status, 0, good.stdout + good.stderr);
    assert.match(good.stdout, /5 test points: 4 agree to the millimetre, 1 refused where Ordnance Survey gives none, 0 wrong\./);
    const bad = tool(gridFile, inFile, outFile('bad.txt', 0.002));
    assert.equal(bad.status, 1, bad.stdout + bad.stderr);
    assert.match(bad.stdout, /WRONG IP01/);
  });

  test('2, in a plain sentence and with no stack trace, when nothing could be checked: a short grid, a missing file, a missing column', async () => {
    const short = join(dir, 'short-grid.txt');
    await writeGrid(short, 3);
    for (const [g, i, o, re] of [
      [short, inFile, join(dir, 'good.txt'), /does not hold all 876951 grid points/],
      [join(dir, 'no-such-grid.txt'), inFile, join(dir, 'good.txt'), /could not be read/],
      [gridFile, inFile, outFile('no-north.txt', 0, true), /no northing column/],
      [gridFile, join(dir, 'no-such-input.txt'), join(dir, 'good.txt'), /could not be read/],
    ] as const) {
      const r = tool(g, i, o);
      assert.equal(r.status, 2, `${String(re)}: ${r.stdout}${r.stderr}`);
      assert.match(r.stderr, re);
      assert.match(r.stderr, /Nothing was checked\./);
      assert.doesNotMatch(r.stderr, /\n\s+at /, 'a stack trace was printed');
    }
    rmSync(dir, { recursive: true, force: true });
  });

  test('the demo launcher names OS\'s grid file in CAPREBATE_OSTN15_FILE when it is on this machine, and only when nothing else is named', () => {
    const src = readFileSync(join(BACKEND, 'tools', 'demo-server.cjs'), 'utf8');
    assert.match(src, /process\.env\.CAPREBATE_OSTN15_FILE === undefined/);
    assert.match(src, /'caprebate-data', 'ostn15', 'OSTN15_OSGM15_DataFile\.txt'/);
    assert.match(src, /fs\.existsSync\(grid\)/);
  });
});

/* ================================================================== 4 · the words that disagreed */

describe('Phase 151c, line 4: the licence row and the boundary module say the same about the site area', () => {
  test('neither says the area may go in a client report; both keep it for our own checks until Lakhbir decides', () => {
    const report = checkBoundaryUse('CLIENT_REPORT_DISPLAY');
    assert.equal(report.permitted, false);
    assert.doesNotMatch(report.reason, /may be reported/);
    assert.match(report.reason, /for our own checks too, until Lakhbir decides/);
    const row = LICENCES.find((l) => l.licence_id === 'HMLR_INSPIRE');
    assert.equal(row?.redistribution.client_report, false);
    assert.match(row?.notes ?? '', /until Lakhbir decides whether the number itself may go in a client report/);
    assert.equal(checkBoundaryUse('INTERNAL_CALCULATION').permitted, true);
  });
});

/* ================================================================== 8 · Accounting's Help link */

describe('Phase 151c, line 8: the Clients tab\'s Help names B55 for a login that sees the billing view', () => {
  test('by the rule: Accounting B55 on the list and on a client; Admin and Sales B5; a company\'s files still B47', async () => {
    const w = await world();
    try {
      assert.equal(helpScreenFor('/staff/clients', w.who('ACCOUNTING')), 'B55');
      assert.equal(helpScreenFor(`/staff/clients/${w.signed}`, w.who('ACCOUNTING')), 'B55');
      assert.equal(helpScreenFor('/staff/clients', w.who('ADMIN')), 'B5');
      assert.equal(helpScreenFor('/staff/clients', w.who('SALES')), 'B5');
      assert.equal(helpScreenFor(`/staff/clients/${w.signed}/files`, w.who('ADMIN')), 'B47');
      assert.equal(helpScreenFor('/staff/tasks', w.who('ACCOUNTING')), 'B22');
    } finally { w.close(); }
  });

  test('on the page: Accounting\'s header links to B55, Admin\'s to B5', async () => {
    const w = await world({ listen: true });
    try {
      const href = (body: string) => /<a class="helplink" href="([^"]+)">Help<\/a>/.exec(body)?.[1]?.replace(/&amp;/g, '&');
      const acc = await w.signIn('accounting@example.invalid');
      const a = await acc.get('/staff/clients');
      assert.equal(a.status, 200);
      assert.equal(href(a.body), '/staff/help?screen=B55');
      const admin = await w.signIn('admin@example.invalid');
      assert.equal(href((await admin.get('/staff/clients')).body), '/staff/help?screen=B5');
    } finally { w.close(); }
  });
});
