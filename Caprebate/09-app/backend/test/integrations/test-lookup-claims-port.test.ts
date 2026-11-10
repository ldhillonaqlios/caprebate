/**
 * PHASE 161l2: THE OUTSIDE SERVICES' PORT FOR WHAT THE TEST LOOKUPS ASK THE CLAIMS
 * (src/integrations/connectors/test-lookup-claims.ts).
 *
 * The command line's test lookups (src/integrations/connectors/test-lookups.ts) once imported the claims' data file and
 * document pipeline, so they could not load through the outside services' door. They now ask a port the outside
 * services own, which the claims' front door fills as it loads. This holds that the port refuses, loudly, when nothing
 * has filled it, and that a client check then refuses rather than passes; that loading the claims' door fills it; and
 * that its reads give exactly the claims' statements' rows.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { testApp } from '../helpers.ts';
import { seed } from '../../src/app/seed.ts';

const BACKEND = join(import.meta.dirname, '..', '..');
const run = (code: string): string => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: BACKEND, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};

test('asked before the claims have filled it, the port refuses and says why; the client check then refuses too', () => {
  const out = run("const p = await import('./src/integrations/connectors/test-lookup-claims.ts'); " +
    "try { p.testLookupClaims(); console.log('ANSWERED'); } catch (e) { console.log('REFUSED: ' + e.message); } " +
    "const L = await import('./src/integrations/connectors/test-lookups.ts'); " +
    "const db = { all: () => [] }; " +
    "console.log(JSON.stringify(L.boundaryClientMatchIn(db, { easting: 1, northing: 1, lad_code: 'E06000001', council: 'A council', file: 'a.zip' })));");
  const [first, second] = out.split('\n');
  assert.match(first ?? '', /^REFUSED: The claims are not set up\. They set this up when they load/);
  assert.match(second ?? '', /"ok":false/);
  assert.match(second ?? '', /could not be read/);
});

test("loading the claims' front door fills it", () => {
  const out = run("await import('./src/modules/claims/index.ts'); const p = await import('./src/integrations/connectors/test-lookup-claims.ts'); " +
    "const c = p.testLookupClaims(); console.log(['propertyPostcodes', 'siteAreaPoints', 'siteAreaCouncils', 'readTestPage'].map((k) => typeof c[k]).join(' '));");
  assert.equal(out, 'function function function function');
});

test("its reads give the claims' statements' rows", async () => {
  const app = await testApp();
  await seed(app.db, app.hasher, app.now);
  const { testLookupClaims } = await import('../../src/integrations/connectors/test-lookup-claims.ts');
  const c = testLookupClaims();
  assert.deepEqual(c.propertyPostcodes(app.db), app.db.all('SELECT postcode FROM properties'));
  assert.deepEqual(c.siteAreaPoints(app.db), app.db.all("SELECT easting, northing FROM site_area_inputs WHERE kind = 'POINT'"));
  assert.deepEqual(c.siteAreaCouncils(app.db), app.db.all("SELECT lad_code FROM site_area_inputs WHERE kind = 'NEIGHBOUR_COUNCIL'"));
  assert.ok(c.propertyPostcodes(app.db).length > 0, 'the seed has properties, so the comparison is about something');
  app.close();
});
