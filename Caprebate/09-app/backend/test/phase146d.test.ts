/**
 * PHASE 146d, 23 September 2026 — THE PAID LOOKUPS, BUILT FOR REAL AND SWITCHED OFF.
 *
 * Homedata's address lookup and HM Land Registry's title register, each run on recorded answers
 * (test/fixtures/phase146d/, shaped from the suppliers' published documentation, invented values), with no key and no
 * network. And the three things the phase says must be proved rather than asserted: that an engagement which is not
 * signed — however it is not signed — keeps every paid call shut and that a signed one opens it; that the Homedata
 * connector never asks for one of the supplier's bundles; and that a case officer can never be written on a planning
 * record.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { fixtureTransport, RateLimiter, callOutside, certificateTransport, chargeFromHeaders, type CallDeps, type GateSnapshot, type Fixture } from '../src/connectors/http.ts';
import { CALL_POLICIES } from '../src/connectors/sources.ts';
import * as C from '../src/connectors/registers.ts';
import { homedataAddress, isTierPath, homedataCostPence, addressFields, preCheckOf, uprnOf, HOMEDATA_SLUGS, HOMEDATA_TIER_PATHS } from '../src/connectors/homedata.ts';
import { hmlrTitle, registerFields, soapText, amount, registerDate, priorOwnerCount, SOAP_PREFIX, REST_PREFIX } from '../src/connectors/hmlr-title.ts';
import { homedataPlanning, applicationFields } from '../src/connectors/homedata-planning.ts';
import { PAID_CONNECTORS, PAID_NOT_CHOSEN, PAID_RETIRED, totalBeforePence, pounds, preCheckFrom, uprnFrom } from '../src/connectors/paid-registers.ts';
import { FREE_CONNECTORS } from '../src/connectors/free-registers.ts';
import { epc } from '../src/connectors/epc.ts';
import { secretsFromValues, emptySecrets, SECRET_KEYS, parseSecretsFile, KEY_OF_NAME } from '../src/secrets.ts';
import { SOURCES as REGISTER_SOURCES, LICENCES, SUPPLIER_DOCS } from '../../../04-phase-work/phase3/caprebate-source-register.ts';
import { NAME_EXCLUSION_POLICY, classifyField, assertNoUnauthorisedName } from '../../../04-phase-work/phase3/caprebate-name-exclusion.ts';
import * as R from '../src/web/research.ts';
import * as S from '../src/web/surveyor.ts';
import { STUBS } from '../src/app.ts';
import { seed } from '../src/seed.ts';
import { newId } from '../src/users.ts';
import { testApp, actor, signatureRecordFor } from './helpers.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SRC = join(HERE, '..', 'src');
const fx = (name: string): string => readFileSync(join(HERE, 'fixtures', 'phase146d', name), 'utf8');
const ok = (name: string): Fixture => ({ status: 200, body: fx(name) });

const KEYS = secretsFromValues({
  HOMEDATA_API_KEY: 'homedata-fixture-key-146d',
  HMLR_BG_USERNAME: 'bg-fixture-user-146d', HMLR_BG_PASSWORD: 'bg-fixture-password-146d',
  HMLR_BG_CERT_PATH: '/nowhere/invented-certificate.p12', HMLR_BG_CERT_PASSPHRASE: 'bg-fixture-passphrase-146d',
});
const ALL_ON: Readonly<Record<string, boolean>> = Object.freeze(Object.fromEntries(Object.keys(C.REGISTER_SWITCHES).map((k) => [k, true])));
const ALLOWED = { state: 'NOT_RUN' as const, detail: 'allowed' };
const GATE: GateSnapshot = { free_gate_open: true, engagement_signed: true, switched_on: true };
const T0 = '2026-09-23T09:00:00.000Z';

const PROPERTY = { id: 'p-1', address_line_1: '12 Invented Road', address_line_2: null, town: 'Nowhere', postcode: 'ZZ1 1ZZ', jurisdiction: 'england' as const };

/* The paths the fixture transport answers on. A postcode is filled into the path and encoded, so the key carries the
   encoded form — which is what `new URL(...).pathname` gives the transport. */
const PC_PATH = `/address/postcode/${encodeURIComponent('ZZ1 1ZZ')}/`;
const UPRN_PATH = '/property/100091234567/';
const BG_SEARCH = `${SOAP_PREFIX.live}/SearchByPropertyDescriptionV2_0WebService`;
const BG_COPY = `${SOAP_PREFIX.live}/OfficialCopyTitleKnownV2_1WebService`;
const BG_AVAIL = `${REST_PREFIX.live}/s1/v1/titles/ZZ123456/official-copies/availability`;

const HOMEDATA_OK = { [`GET ${PC_PATH}`]: ok('homedata-postcode.json'), [`GET ${UPRN_PATH}`]: ok('homedata-property.json') };
const HMLR_OK = {
  [`POST ${BG_SEARCH}`]: ok('hmlr-search.xml'),
  [`GET ${BG_AVAIL}`]: ok('hmlr-availability.json'),
  [`POST ${BG_COPY}`]: ok('hmlr-official-copy.xml'),
};

async function rig(fixtures: Record<string, Fixture | readonly Fixture[]>) {
  const app = await testApp();
  const t = fixtureTransport(fixtures);
  const d: CallDeps = { audit: app.audit, now: app.now, transport: t, limiter: new RateLimiter(), sleep: async () => { /* no wait */ } };
  const ctx: C.ConnectorContext = { deps: d, actor_id: 'u-ADMIN', actor_role: 'ADMIN', claim_id: null, gate: GATE, secrets: null };
  const rows = () => app.db.all<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'CONNECTOR_CALLED' ORDER BY seq");
  return { app, t, d, ctx, rows };
}

/* ================================================================== *
 * 1 · THE PAID GATE — THE ONE THE PHASE SAYS MUST BE PROVED FOUR WAYS
 * ================================================================== */

describe('a paid lookup waits for a signed engagement, and "not signed" has four shapes', () => {
  const entry = () => R.catalogue().find((e) => e.source_id === 'HOMEDATA_ADDRESS')!;
  const freeOpen = { open: true, requires: '', enabled: true } as unknown as ReturnType<typeof R.freeGate>;

  test('UNSIGNED, "NOT SURE", NULL AND ABSENT ALL KEEP IT SHUT — and only a real signed record opens it', () => {
    const e = entry();
    const shut = [
      { signed: false, letter_state: 'SENT', signed_at: null, why: 'the engagement letter is sent and not yet opened' },
      /* The "not sure" case, and it is the one a refactor breaks silently: a truthy non-boolean. Under `!signed`
         this would have OPENED the paid tier. Under `signed === true` it does not. */
      { signed: 'not sure', letter_state: 'SIGNED', signed_at: null, why: 'somebody typed not sure' },
      null,
      undefined,
    ];
    for (const engagement of shut) {
      const r = R.stateUnderGates(e, 'NOT_RUN', freeOpen, engagement as never);
      assert.equal(r.state, 'NOT_PERMITTED_YET', JSON.stringify(engagement));
      assert.match(r.detail, /paid lookups wait until the engagement letter is signed/);
    }
    const open = R.stateUnderGates(e, 'NOT_RUN', freeOpen, { signed: true, letter_state: 'SIGNED', signed_at: T0, why: 'the engagement letter is signed' });
    assert.equal(open.state, 'NOT_RUN');
    assert.match(open.detail, /allowed, but not switched on yet/);
  });

  test('SIGNED ALONE IS NOT SIGNED: a letter marked SIGNED with no signature record keeps every paid call shut', async () => {
    const app = await testApp();
    const r = await seed(app.db, app.hasher, app.now);
    const id = r.businesses[0]!.id;
    app.db.run('INSERT INTO engagements (id, business_id, letter_state, signed_at, created_at) VALUES (?, ?, ?, ?, ?) ' +
      'ON CONFLICT(business_id) DO UPDATE SET letter_state = excluded.letter_state, signed_at = excluded.signed_at',
      [randomUUID(), id, 'SIGNED', T0, T0]);
    const marked = R.assertSignedEngagement(app.db, id);
    assert.equal(marked.signed, false, 'a state flipped by hand counted as signed');
    assert.equal(R.stateUnderGates(entry(), 'NOT_RUN', freeOpen, marked).state, 'NOT_PERMITTED_YET');

    // The same letter WITH its signature record is signed — which is what makes the line above a real test.
    signatureRecordFor(app.db, id, T0);
    const recorded = R.assertSignedEngagement(app.db, id);
    assert.equal(recorded.signed, true, 'a letter with its signature record is not signed');
    assert.equal(R.stateUnderGates(entry(), 'NOT_RUN', freeOpen, recorded).state, 'NOT_RUN');
    app.close();
  });

  test('AND THE WHOLE CLICK: unsigned, every switch on and every answer recorded, NOTHING is sent and nothing is spent', async () => {
    const app = await testApp();
    const r = await seed(app.db, app.hasher, app.now);
    const id = r.businesses[0]!.id;
    app.db.run("UPDATE properties SET address_line_1 = '12 Invented Road', town = 'Nowhere', postcode = 'ZZ1 1ZZ', jurisdiction = 'england' WHERE business_id = ?", [id]);
    const t = fixtureTransport({ ...HOMEDATA_OK, ...HMLR_OK });
    const admin = app.db.get<{ id: string }>("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY id LIMIT 1")!.id;
    const out = await R.runResearch(
      { db: app.db, audit: app.audit, now: app.now, newId, outside: { transport: t, secrets: KEYS, switches: ALL_ON } },
      actor('ADMIN', admin), id);
    assert.equal(t.seen.length, 0, 'a paid call was made without a signed engagement');
    assert.equal(out.cost_pence, 0);
    assert.equal(out.cost_words, 'Nothing was spent.');
    for (const s of R.sourcesFor(app.db, actor('ADMIN'), id).sources.filter((x) => x.tier === 'PAID')) {
      assert.equal(s.state, 'NOT_PERMITTED_YET', s.source_id);
    }
    app.close();
  });
});

/* ================================================================== *
 * 2 · SLUGS, NEVER TIERS
 * ================================================================== */

describe('the paid address lookup asks for named slugs and never for one of the supplier’s bundles', () => {
  test('THE CONNECTOR NEVER REQUESTS A TIER PATH — not on a good run, not on any run', async () => {
    const { app, t, ctx } = await rig(HOMEDATA_OK);
    const run = await C.runConnector(homedataAddress, ctx, { property: PROPERTY }, ALLOWED, KEYS, ALL_ON);
    assert.equal(run.state, 'FIRED', run.detail);
    assert.ok(t.seen.length > 0);
    for (const s of t.seen) {
      const path = new URL(s.url).pathname;
      assert.equal(isTierPath(path), false, `a tier path was requested: ${path}`);
      for (const tier of HOMEDATA_TIER_PATHS) {
        assert.equal(new RegExp(`/property/[^/]+/${tier}/?$`).test(path), false, `${path} ends in the ${tier} bundle`);
      }
    }
    // And what it DID ask for: the named slugs, as a comma list, and nothing else.
    const detail = t.seen.find((s) => new URL(s.url).pathname === UPRN_PATH)!;
    assert.equal(new URL(detail.url).searchParams.get('with'), HOMEDATA_SLUGS.join(','));
    app.close();
  });

  test('the source file names no bundle path, so one cannot be reintroduced by editing a string', () => {
    const text = readFileSync(join(SRC, 'connectors', 'homedata.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    for (const tier of ['base', 'core', 'complete']) {
      assert.equal(new RegExp(`['"\`][^'"\`]*/property/[^'"\`]*/${tier}/`).test(text), false, `the ${tier} bundle is named in code`);
    }
  });

  test('isTierPath knows a bundle from a slug call', () => {
    for (const p of ['/property/100091234567/base/', '/property/100091234567/core', '/property/1/complete/', '/property/1/address/']) {
      assert.equal(isTierPath(p), true, p);
    }
    for (const p of ['/property/100091234567/', '/address/postcode/ZZ1%201ZZ/', '/property/1/planning/history/']) {
      assert.equal(isTierPath(p), false, p);
    }
  });
});

/* ================================================================== *
 * 3 · A CASE OFFICER IS A NAME, AND IT IS BARRED
 * ================================================================== */

describe('a case officer can never be written on a planning record', () => {
  test('officer_* AND case_officer_* ARE EXCLUDED on PLANNING, in both registers, and the one door refuses one', () => {
    /* THE TEST IS ON THE FIELD NAMES, NOT ON THE SPELLING OF THE GLOB. `case_officer_*` would have looked right in
       both registers and matched nothing PlanIt actually sends, because the field it sends is `case_officer` with
       nothing after it. So each real name is classified, and the patterns are free to change. */
    const src = REGISTER_SOURCES.find((s) => s.source_id === 'PLANNING')!;
    assert.ok(src.excluded_fields.some((p) => p.startsWith('case_officer')), 'no case officer pattern on the source row');
    const policy = NAME_EXCLUSION_POLICY.find((p) => p.sourceId === 'PLANNING')!;
    assert.ok(policy.excludedNameFields.some((p) => p.startsWith('case_officer')), 'no case officer pattern in the name register');
    for (const field of ['case_officer', 'case_officer_name', 'officer_name', 'officer_email']) {
      assert.equal(classifyField('PLANNING', field).kind, 'name_excluded', field);
      assert.throws(
        () => assertNoUnauthorisedName({ sourceId: 'PLANNING', entityId: 'ZZ/2019/0456', fields: { [field]: 'A Person' } }),
        /personal-name field/, field);
    }
  });

  test('THE PAID PLANNING ROUTE READS NAMED KEYS ONLY: a fixture carrying a case officer and an applicant keeps neither', () => {
    const body = JSON.parse(fx('homedata-planning.json')) as { planning_history: { applications: Record<string, unknown>[] } };
    const raw = body.planning_history.applications[0]!;
    assert.ok('case_officer' in raw && 'applicant_name' in raw, 'the fixture no longer carries the fields this test is about');
    const kept = applicationFields(raw, '100091234567')!;
    assert.deepEqual(Object.keys(kept).sort(), [
      'planning_decision', 'planning_decision_date', 'planning_description', 'planning_received_date', 'planning_reference', 'planning_uprn',
    ]);
    assert.doesNotThrow(() => assertNoUnauthorisedName({ sourceId: 'PLANNING', entityId: 'ZZ/2019/0456', fields: kept }));
  });

  test('THE ROW’S CLAIM ABOUT ITSELF IS TRUE NOW: it no longer says it holds no free text, and it says what it does hold', () => {
    const register = readFileSync(join(HERE, '..', '..', '..', '04-phase-work', 'phase3', 'caprebate-source-register.ts'), 'utf8');
    /* The old sentence may still appear ONCE, quoted, in the paragraph that says it was wrong — that is how the
       correction stays legible to whoever reads it next. It may not appear as a claim. */
    const claim = /contains no free-text field that could carry a third party's name/g;
    assert.equal(register.match(claim)?.length ?? 0, 1, 'the false comment is stated more than once');
    assert.match(register, /WHAT THIS COMMENT USED TO SAY, AND WHY IT WAS WRONG/);
    assert.match(register, /IT DOES: `planning_description`/);
    assert.match(register, /a planning description routinely carries a surname/);
    const policy = NAME_EXCLUSION_POLICY.find((p) => p.sourceId === 'PLANNING')!;
    // planning_description is free text, it IS kept, and both registers now say so rather than implying otherwise.
    assert.ok(policy.keptFields.includes('planning_description'));
    assert.match(policy.note, /planning_description' IS free text/);
    assert.match(policy.note, /NO BEST-EFFORT NAME FILTER IS BUILT/);
  });
});

/* ================================================================== *
 * 4 · THE ADDRESS LOOKUP
 * ================================================================== */

describe('the paid address lookup: a UPRN, coordinates, and a penny pre-check in front of a £7 call', () => {
  test('the matched address only, with its coordinates — and the one door accepts every field it keeps', async () => {
    const { app, t, ctx } = await rig(HOMEDATA_OK);
    const run = await C.runConnector(homedataAddress, ctx, { property: PROPERTY }, ALLOWED, KEYS, ALL_ON);
    assert.equal(run.state, 'FIRED', run.detail);
    const rec = run.bundle!.records[0]!;
    assert.equal(rec.entityId, '100091234567');
    assert.deepEqual(rec.fields, {
      uprn: '100091234567', address_line: '12 Invented Road, Nowhere', postcode: 'ZZ1 1ZZ',
      latitude: 52.123456, longitude: -1.234567,
    });
    assert.doesNotThrow(() => assertNoUnauthorisedName({ sourceId: 'HOMEDATA_ADDRESS', entityId: rec.entityId, fields: rec.fields }));
    // Its neighbours were returned and are not kept; USRN, TOID and UDPRN were returned and are not kept.
    for (const unwanted of ['usrn', 'toid', 'udprn']) assert.equal(unwanted in rec.fields, false, unwanted);
    assert.equal(JSON.stringify(run.bundle!.records).includes('100091234568'), false, 'a neighbour was kept');
    // The key went in a header, never in the query string an audit row records the names of.
    for (const s of t.seen) assert.equal(new URL(s.url).searchParams.has('api_key'), false);
    assert.equal(t.seen[0]?.headers['authorization']?.startsWith('Api-Key '), true, 'the header is not Api-Key');
    app.close();
  });

  test('THE PENNY PRE-CHECK IS FACTS, NEVER A STORED RECORD: it chains to the title register and is not written down', async () => {
    const { app, ctx } = await rig(HOMEDATA_OK);
    const run = await C.runConnector(homedataAddress, ctx, { property: PROPERTY }, ALLOWED, KEYS, ALL_ON);
    const earlier = new Map([['HOMEDATA_ADDRESS', run.bundle!]]);
    assert.deepEqual(preCheckFrom(earlier), { has_title: true, title_number: 'ZZ123456' });
    assert.equal(uprnFrom(earlier), '100091234567');
    // Nothing about the title is on the record that is stored.
    assert.equal('title_number' in run.bundle!.records[0]!.fields, false);
    assert.equal('tenure' in run.bundle!.records[0]!.fields, false);
    app.close();
  });

  test('NO TITLE FOUND SAVES THE £7, AND "WE DID NOT LOOK" DOES NOT — the two are different facts', async () => {
    const { app, t, ctx } = await rig({ ...HOMEDATA_OK, [`GET ${UPRN_PATH}`]: ok('homedata-property-no-title.json'), ...HMLR_OK });
    const run = await C.runConnector(homedataAddress, ctx, { property: PROPERTY }, ALLOWED, KEYS, ALL_ON);
    const pre = preCheckFrom(new Map([['HOMEDATA_ADDRESS', run.bundle!]]));
    assert.deepEqual(pre, { has_title: false, title_number: null });
    assert.match(run.detail, /found no registered title/);

    const sent = t.seen.length;
    const skipped = await C.runConnector(hmlrTitle, ctx, { property: PROPERTY, nation: 'england' as const, pre_check: pre }, ALLOWED, KEYS, ALL_ON);
    assert.equal(skipped.state, 'NOT_RUN');
    assert.match(skipped.detail, /penny pre-check found no registered title/);
    assert.equal(t.seen.length, sent, 'the £7 call was made after the pre-check said there was no title');

    // A pre-check that did NOT run is not a reason to skip: the call goes ahead.
    const ran = await C.runConnector(hmlrTitle, ctx, { property: PROPERTY, nation: 'england' as const, pre_check: null }, ALLOWED, KEYS, ALL_ON);
    assert.equal(ran.state, 'FIRED', ran.detail);
    assert.ok(t.seen.length > sent);
    app.close();
  });

  test('no match keeps nothing and spends what the search cost, not what the lookup would have', async () => {
    const { app, ctx } = await rig(HOMEDATA_OK);
    const run = await C.runConnector(homedataAddress, ctx,
      { property: { ...PROPERTY, address_line_1: '99 Somewhere Else' } }, ALLOWED, KEYS, ALL_ON);
    assert.equal(run.state, 'FAILED');
    assert.equal(run.bundle, null);
    assert.equal(run.failure_code, 'NO_MATCH');
    app.close();
  });

  test('the readers keep a fact only when the answer gives it, and never a 0 or an empty string for an absent one', () => {
    assert.deepEqual(addressFields({}, '100091234567', 'ZZ1 1ZZ'), { uprn: '100091234567', postcode: 'ZZ1 1ZZ' });
    assert.deepEqual(addressFields({ latitude: 52, longitude: 999 }, '1', ''), { uprn: '1' }, 'an impossible longitude was kept');
    assert.deepEqual(preCheckOf(null), { has_title: false, title_number: null, tenure: null, restrictions: null });
    assert.deepEqual(preCheckOf({ title_number: 'ZZ1', tenure: 'LEASEHOLD' }).tenure, 'leasehold');
    assert.equal(uprnOf('not-a-uprn'), null);
    assert.equal(uprnOf(100091234567), '100091234567');
  });
});

/* ================================================================== *
 * 5 · THE TITLE REGISTER
 * ================================================================== */

describe('the title register: the price four of five sectors have no other source for', () => {
  test('a company proprietor: the price, the date, the tenure and the prior-owner COUNT — and no former owner’s name', async () => {
    const { app, ctx } = await rig(HMLR_OK);
    const run = await C.runConnector(hmlrTitle, ctx, { property: PROPERTY, nation: 'england' as const }, ALLOWED, KEYS, ALL_ON);
    assert.equal(run.state, 'FIRED', run.detail);
    const rec = run.bundle!.records[0]!;
    assert.equal(rec.fields['title_number'], 'ZZ123456');
    assert.equal(rec.fields['price_paid'], 1250000);
    assert.equal(rec.fields['transaction_date'], '2004-06-11');
    assert.equal(rec.fields['tenure'], 'freehold');
    assert.equal(rec.fields['prior_owner_count'], 2);
    assert.equal(rec.fields['proprietor_company_number'], '09999991');
    assert.equal('proprietor_name_personal' in rec.fields, false, 'a company name was written as a personal one');
    assert.equal(JSON.stringify(rec.fields).includes('INVENTED CARE HOMES'), false, 'a company name was kept at all');
    assert.doesNotThrow(() => assertNoUnauthorisedName(rec));
    app.close();
  });

  test('A PERSONAL PROPRIETOR IS EXCEPTION 2, AND THE RECORD SAYS SO — without the discriminant the one door refuses it', async () => {
    const { app, ctx } = await rig({ ...HMLR_OK, [`POST ${BG_COPY}`]: ok('hmlr-official-copy-personal.xml') });
    const run = await C.runConnector(hmlrTitle, ctx, { property: PROPERTY, nation: 'england' as const }, ALLOWED, KEYS, ALL_ON);
    assert.equal(run.state, 'FIRED', run.detail);
    const rec = run.bundle!.records[0]!;
    assert.equal(rec.fields['proprietor_name_personal'], 'AN INVENTED PERSON');
    assert.equal(rec.proprietorType, 'individual');
    assert.equal(classifyField('HMLR_TITLE', 'proprietor_name_personal').kind, 'name_retained_exception');
    assert.doesNotThrow(() => assertNoUnauthorisedName(rec));
    // The same fields without the discriminant are refused: the exception is not a spelling, it is a finding.
    assert.throws(() => assertNoUnauthorisedName({ sourceId: rec.sourceId, entityId: rec.entityId, fields: rec.fields }), /Exception 2/);
    // A lease: the term is kept, and the value stated is read as the price.
    assert.equal(rec.fields['tenure'], 'leasehold');
    assert.equal(rec.fields['price_paid'], 480000);
    app.close();
  });

  test('NO OFFICIAL COPY TO BUY: the £7 call is not made, and the reason says so', async () => {
    const { app, t, ctx } = await rig({ ...HMLR_OK, [`GET ${BG_AVAIL}`]: ok('hmlr-availability-none.json') });
    const run = await C.runConnector(hmlrTitle, ctx, { property: PROPERTY, nation: 'england' as const }, ALLOWED, KEYS, ALL_ON);
    assert.equal(run.state, 'NOT_RUN');
    assert.match(run.detail, /no official copy of its register can be supplied/);
    assert.equal(t.seen.some((s) => new URL(s.url).pathname === BG_COPY), false, 'the £7 call was made anyway');
    app.close();
  });

  test('NO CERTIFICATE, NO CALL — and the words name the key, never a value', async () => {
    const { app, t, ctx } = await rig(HMLR_OK);
    /* A missing key name is caught by `configured()`, BEFORE the lookup runs at all — which is earlier and better
       than the check inside it. The state is NOT_RUN because nothing was attempted, and the words name the key. */
    const partial = secretsFromValues({ HMLR_BG_USERNAME: 'u', HMLR_BG_PASSWORD: 'p', HMLR_BG_CERT_PATH: '/nowhere/x.p12' });
    const run = await C.runConnector(hmlrTitle, ctx, { property: PROPERTY, nation: 'england' as const }, ALLOWED, partial, ALL_ON);
    assert.equal(run.state, 'NOT_RUN');
    assert.equal(run.readiness, 'NOT_CONFIGURED');
    assert.match(run.detail, /HMLR_BG_CERT_PASSPHRASE/);
    assert.equal(t.seen.length, 0);
    assert.equal(run.detail.includes('/nowhere/x.p12'), false, 'a value from the key file reached the words');

    // With no key at all it names all four, and still sends nothing.
    const none = await C.runConnector(hmlrTitle, ctx, { property: PROPERTY, nation: 'england' as const }, ALLOWED, emptySecrets(), ALL_ON);
    assert.equal(none.readiness, 'NOT_CONFIGURED');
    assert.match(none.detail, /HMLR_BG_USERNAME/);
    assert.equal(t.seen.length, 0);

    /* AND THE SECOND LINE, which is what the in-lookup check is for: every key NAME present, but the certificate
       FILE unreadable. `configured()` cannot see that — it reads names — so the lookup catches it and still sends
       nothing. */
    const broken = certificateTransport(KEYS.forOwner('HMLR_TITLE'), () => { throw new Error('ENOENT'); });
    assert.equal(broken.ok, false);
    app.close();
  });

  test('SCOTLAND AND NORTHERN IRELAND KEEP THEIR OWN REGISTERS, so nothing is sent and nothing is spent', async () => {
    const { app, t, ctx } = await rig(HMLR_OK);
    for (const nation of ['scotland', 'northern_ireland'] as const) {
      const run = await C.runConnector(hmlrTitle, ctx, { property: PROPERTY, nation }, ALLOWED, KEYS, ALL_ON);
      assert.equal(run.state, 'NOT_RUN', nation);
      assert.equal(run.cost_pence, 0);
    }
    assert.equal(t.seen.length, 0);
    app.close();
  });

  test('the SOAP reader takes an element by its local name, and reads nothing it was not asked for', () => {
    const xml = fx('hmlr-official-copy.xml');
    assert.equal(soapText(xml, 'TitleNumber'), 'ZZ123456');
    assert.equal(soapText(xml, 'NotThere'), null);
    assert.equal(priorOwnerCount(xml), 2);
    assert.equal(amount('£1,250,000'), 1250000);
    assert.equal(amount('0'), null, 'a zero price was read as a price');
    assert.equal(amount(null), null);
    assert.equal(registerDate('11 June 2004'), '2004-06-11');
    assert.equal(registerDate('11/06/2004'), '2004-06-11');
    assert.equal(registerDate('sometime in 2004'), null);
    assert.equal(registerFields('<a/>')['price_paid'], undefined, 'an empty answer produced a price');
  });

  test('THE SURVEYOR NEVER RECEIVES THE PRICE: an amount between buyer and seller waits with our own estimate', () => {
    assert.deepEqual(S.REGISTER_AMOUNTS_WITHHELD['HMLR_TITLE'], ['price_paid']);
    const surveyor = readFileSync(join(SRC, 'web', 'surveyor.ts'), 'utf8');
    assert.match(surveyor, /HMLR_TITLE: Object\.freeze\(\['price_paid'\]\)/);
  });

  test('THE PRESCRIBED WORDS GO WITH IT ON A SCREEN, READ FROM THE LICENCE REGISTER AND NEVER RETYPED', () => {
    assert.ok(R.ATTRIBUTION_SHOWN_WITH.includes('HMLR_TITLE'));
    const words = R.registerAttribution('HMLR_TITLE');
    assert.equal(words, LICENCES.find((l) => l.licence_id === 'HMLR_TITLE')!.attribution_text);
    assert.match(words ?? '', /HM Land Registry/);
  });

  test('ONWARD SUPPLY TO THE ACCOUNTANT IS THE SOLICITOR’S TO OPEN, AND THE REGISTER STILL SAYS SO', () => {
    const licence = LICENCES.find((l) => l.licence_id === 'HMLR_TITLE')!;
    assert.equal(licence.redistribution.client_report, false);
    assert.equal(licence.legal_review_required, true);
    assert.match(licence.notes, /solicitor confirmation/);
  });
});

/* ================================================================== *
 * 6 · WHAT IT COSTS, BEFORE AND AFTER
 * ================================================================== */

describe('the cost, shown before the click from a price list and after it from the suppliers’ own answers', () => {
  test('BEFORE: the sum of the published weights — and, since Phase 146k, never the £7 title, which a person buys by hand', () => {
    assert.equal(homedataCostPence(HOMEDATA_SLUGS), 8, 'the postcode search (2) plus address (5) plus lr_title (1)');
    assert.equal(CALL_POLICIES['HMLR_TITLE']?.cost_pence, 700, 'the retired connector keeps its price list');
    const both = ['HOMEDATA_ADDRESS', 'HMLR_TITLE'];
    assert.equal(totalBeforePence(both, () => true), 8, 'the retired title register was priced into the click');
    assert.equal(totalBeforePence(both, (id) => C.switchedOn(id)), 0, 'a switched-off lookup was priced');
    assert.equal(pounds(8), '8p');
    assert.equal(pounds(708), '£7.08');
  });

  test('THE PANEL SAYS SO IN WORDS, AND THE PAGE PRINTS THEM — today the words are that nothing will be spent', async () => {
    const app = await testApp();
    const r = await seed(app.db, app.hasher, app.now);
    const id = r.businesses[0]!.id;
    const panel = R.sourcesFor(app.db, actor('ADMIN'), id);
    assert.equal(panel.cost_before_pence, 0);
    assert.equal(panel.cost_before_words, 'This will not cost anything. The lookups we pay for are not switched on.');
    // Nothing has been run for this client, so there is no bill to show — and that is not "nothing was spent".
    assert.equal(panel.cost_last_pence, null);
    assert.equal(panel.cost_last_words, null);

    // Run it, and the panel now carries what it did cost, from the run's own row.
    const admin = app.db.get<{ id: string }>("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY id LIMIT 1")!.id;
    const out = await R.runResearch({ db: app.db, audit: app.audit, now: app.now, newId }, actor('ADMIN', admin), id);
    assert.equal(out.cost_pence, 0);
    const after = R.sourcesFor(app.db, actor('ADMIN'), id);
    assert.equal(after.cost_last_pence, 0);
    assert.equal(after.cost_last_words, 'The last time it was run, nothing was spent.');
    // A run recorded before this phase has no figure, and that reads as unknown rather than as free.
    app.db.run('UPDATE research_runs SET cost_pence = NULL WHERE business_id = ?', [id]);
    assert.equal(R.sourcesFor(app.db, actor('ADMIN'), id).cost_last_words, 'The last time it was run, we did not record what it cost.');
    app.close();
  });

  test('BOTH FIGURES REACH THE SCREEN, beside the button, and the page says which is a price list', () => {
    const page = readFileSync(join(SRC, 'web', 'engaged-pages.ts'), 'utf8');
    assert.match(page, /What it costs/);
    assert.match(page, /s\.cost_before_words/);
    assert.match(page, /s\.cost_last_words/);
  });

  test('AFTER: the supplier’s own figure, with `charged` beside it, on every audit row', async () => {
    const charged = { ...ok('homedata-postcode.json'), headers: { 'content-type': 'application/json', 'x-tokens-charged': '2', 'x-tokens-balance': '1847' } };
    const detail = { ...ok('homedata-property.json'), headers: { 'content-type': 'application/json', 'x-tokens-charged': '6', 'x-tokens-balance': '1841' } };
    const { app, ctx, rows } = await rig({ [`GET ${PC_PATH}`]: charged, [`GET ${UPRN_PATH}`]: detail });
    const run = await C.runConnector(homedataAddress, ctx, { property: PROPERTY }, ALLOWED, KEYS, ALL_ON);
    assert.equal(run.state, 'FIRED', run.detail);
    assert.equal(run.cost_pence, 8, 'the run did not add up what the supplier said it charged');
    const audit = rows().map((x) => JSON.parse(x.detail) as Record<string, unknown>);
    assert.deepEqual(audit.map((a) => a['cost_pence']), [2, 6]);
    assert.deepEqual(audit.map((a) => a['charged']), [true, true]);
    assert.deepEqual(audit.map((a) => a['cost_basis']), ['supplier', 'supplier']);
    app.close();
  });

  test('A FAILED CALL IS FREE, AND A COST REPORT THAT COUNTED IT WOULD OVERSTATE WHAT WE SPENT', async () => {
    const { app, ctx, rows } = await rig({
      [`GET ${PC_PATH}`]: [{ status: 500, body: '{}' }, { status: 500, body: '{}' }],
    });
    const run = await C.runConnector(homedataAddress, ctx, { property: PROPERTY }, ALLOWED, KEYS, ALL_ON);
    assert.equal(run.state, 'FAILED');
    assert.equal(run.cost_pence, 0);
    const audit = rows().map((x) => JSON.parse(x.detail) as Record<string, unknown>);
    assert.ok(audit.every((a) => a['charged'] === false), 'a failed call was recorded as charged');
    assert.ok(audit.every((a) => a['cost_basis'] === 'not_billed'));
  });

  test('A CHARGE THE SUPPLIER DID NOT REPORT IS UNKNOWN, NEVER 0 — a quota key sends no X-Tokens-Charged at all', async () => {
    assert.deepEqual(chargeFromHeaders({ 'x-ratelimit-remaining': '9427' }), { charged_pence: null, balance_pence: null });
    assert.deepEqual(chargeFromHeaders({ 'x-tokens-charged': '6', 'x-tokens-balance': '1841' }), { charged_pence: 6, balance_pence: 1841 });
    // The live service sends x-call-weight; it is the same number of tokens and is read as the same thing.
    assert.equal(chargeFromHeaders({ 'x-call-weight': '5' }).charged_pence, 5);
    assert.equal(chargeFromHeaders({ 'x-tokens-charged': 'lots' }).charged_pence, null);

    // A 402 keeps the base charge the supplier says it keeps, and we do not pretend to know what it was.
    const { app, d, rows } = await rig({ 'GET /x': { status: 402, body: fx('homedata-402.json') } });
    const r = await callOutside(d, { service_id: 'HOMEDATA_ADDRESS', endpoint: '/x', actor_id: null, claim_id: null, gate: GATE });
    assert.equal(r.status, 402);
    assert.equal(r.cost_pence, null, 'a 402 was recorded as costing nothing');
    assert.equal(r.charged, false);
    assert.equal(r.cost_basis, 'unknown');
    assert.equal(JSON.parse(rows()[0]!.detail)['cost_pence'], null);
    app.close();
  });

  test('A FREE SERVICE COSTS 0 AND SAYS IT IS FREE — the two are not the same as an unknown', async () => {
    const { app, d } = await rig({ 'GET /x': { status: 200, body: '{}' } });
    const r = await callOutside(d, { service_id: 'EPC', endpoint: '/x', actor_id: null, claim_id: null, gate: GATE });
    assert.deepEqual([r.charged, r.cost_pence, r.cost_basis], [false, 0, 'free']);
    app.close();
  });

  test('THE PRICE LIST IS USED ONLY WHERE A SUPPLIER SERVES A RESPONSE AND PUBLISHES A FIXED FEE', async () => {
    const { app, d } = await rig({ [`GET ${BG_AVAIL}`]: ok('hmlr-availability.json') });
    const r = await callOutside(d, { service_id: 'HMLR_TITLE', endpoint: BG_AVAIL, actor_id: null, claim_id: null, gate: GATE });
    assert.deepEqual([r.charged, r.cost_pence, r.cost_basis], [true, 700, 'price_list']);
    const t = await callOutside(d, { service_id: 'HMLR_TITLE_TEST', endpoint: BG_AVAIL, actor_id: null, claim_id: null, gate: GATE });
    assert.deepEqual([t.charged, t.cost_pence, t.cost_basis], [false, 0, 'free'], 'the test environment was billed');
    app.close();
  });
});

/* ================================================================== *
 * 7 · THE CERTIFICATE, THE KEY FILE AND THE ONE WAY OUT
 * ================================================================== */

describe('a client certificate can be presented, and only from src/connectors/http.ts', () => {
  test('STILL ONLY ONE FILE UNDER src/ REACHES THE NETWORK, now that one of them uses node:https as well', () => {
    const hits: string[] = [];
    for (const f of readdirSync(SRC, { recursive: true }) as string[]) {
      if (!f.endsWith('.ts')) continue;
      const text = readFileSync(join(SRC, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      /* The original guard, plus node:https — which is what a client certificate needs and what nothing but
         http.ts may import. node:http is NOT on the list: the page modules import it for its request and response
         TYPES, and a type is not a way out. */
      if (/(?<![\w.])fetch\s*\((?![^)]*\)\s*[:{])|globalThis\.fetch|\bundici\b|\bhttps?\.(request|get)\s*\(|from ['"]node:https['"]|require\(['"]node:https['"]\)/.test(text)) hits.push(f);
    }
    assert.deepEqual(hits, ['connectors/http.ts']);
  });

  test('no certificate, no passphrase, or a file that cannot be read: each is a state in words, and none throws', () => {
    assert.deepEqual(certificateTransport(null), { ok: false, why: 'the key file has no HMLR_BG_CERT_PATH, so the Land Registry certificate cannot be presented' });
    const noPass = secretsFromValues({ HMLR_BG_CERT_PATH: '/nowhere/x.p12' }).forOwner('HMLR_TITLE');
    assert.match((certificateTransport(noPass) as { why: string }).why, /HMLR_BG_CERT_PASSPHRASE/);
    const both = KEYS.forOwner('HMLR_TITLE');
    const unreadable = certificateTransport(both, () => { throw new Error('ENOENT'); });
    assert.equal(unreadable.ok, false);
    assert.match((unreadable as { why: string }).why, /could not be read/);
    // Not one of those sentences carries a value from the key file.
    for (const s of [(certificateTransport(null) as { why: string }).why, (unreadable as { why: string }).why]) {
      assert.equal(s.includes('/nowhere/invented-certificate.p12'), false);
      assert.equal(s.includes('bg-fixture-passphrase-146d'), false);
    }
  });

  test('THE KEY FILE NAMES THE CERTIFICATE TWO WAYS, AND BOTH ARE READ AS ONE KEY', () => {
    /* The key file on the Mac writes HMLR_BG_CERTIFICATE_PATH; the code asks for HMLR_BG_CERT_PATH. Before this
       phase that line was ignored as an unknown name, silently, and the connector reported no certificate while the
       key file plainly had one. */
    const key = SECRET_KEYS.find((k) => k.name === 'HMLR_BG_CERT_PATH')!;
    assert.deepEqual(key.aliases, ['HMLR_BG_CERTIFICATE_PATH']);
    assert.equal(KEY_OF_NAME.get('HMLR_BG_CERTIFICATE_PATH'), 'HMLR_BG_CERT_PATH');
    const store = secretsFromValues({ HMLR_BG_CERTIFICATE_PATH: '/nowhere/aliased.p12' });
    assert.deepEqual(store.names(), ['HMLR_BG_CERT_PATH'], 'the alias was not read as the key');
    assert.deepEqual(store.unknown_names(), [], 'the alias was still reported as an unknown name');
    assert.equal(store.forOwner('HMLR_TITLE').get('HMLR_BG_CERT_PATH'), '/nowhere/aliased.p12');
    // Where a file holds both, the canonical one wins rather than the older spelling.
    const both = secretsFromValues({ HMLR_BG_CERT_PATH: '/nowhere/canonical.p12', HMLR_BG_CERTIFICATE_PATH: '/nowhere/aliased.p12' });
    assert.equal(both.forOwner('HMLR_TITLE').get('HMLR_BG_CERT_PATH'), '/nowhere/canonical.p12');
    // And an alias belongs to its owner and nobody else.
    assert.equal(store.forOwner('EPC').get('HMLR_BG_CERT_PATH'), null);
    assert.equal(parseSecretsFile('HMLR_BG_CERTIFICATE_PATH=/nowhere/x.p12').get('HMLR_BG_CERTIFICATE_PATH'), '/nowhere/x.p12');
  });

  test('every key these two connectors need is in the key file’s list, under its own owner', () => {
    const owned: readonly (readonly [string, string])[] = [
      ['HOMEDATA_API_KEY', 'HOMEDATA_ADDRESS'], ['HMLR_BG_USERNAME', 'HMLR_TITLE'], ['HMLR_BG_PASSWORD', 'HMLR_TITLE'],
      ['HMLR_BG_CERT_PATH', 'HMLR_TITLE'], ['HMLR_BG_CERT_PASSPHRASE', 'HMLR_TITLE'],
    ];
    for (const [name, owner] of owned) {
      const k = SECRET_KEYS.find((s) => s.name === name);
      assert.ok(k, name);
      assert.equal(k.owner, owner, name);
    }
    // One connector cannot read another's key.
    assert.equal(KEYS.forOwner('HOMEDATA_ADDRESS').get('HMLR_BG_PASSWORD'), null);
    assert.equal(KEYS.forOwner('HMLR_TITLE').get('HOMEDATA_API_KEY'), null);
  });
});

/* ================================================================== *
 * 8 · THE MAP, THE SWITCHES, THE REGISTER AND WHAT IS DELIBERATELY UNBUILT
 * ================================================================== */

describe('the paid map beside the free one, every switch off, and BCIS unbuilt and saying why', () => {
  test('"Run the research" reads BOTH maps, and a source in neither has no connector', () => {
    const research = readFileSync(join(SRC, 'web', 'research.ts'), 'utf8');
    assert.match(research, /FREE_CONNECTORS\[x\.entry\.source_id\] \?\? PAID_CONNECTORS\[x\.entry\.source_id\]/);
    for (const id of ['HOMEDATA_ADDRESS', 'HMLR_TITLE']) {
      assert.equal(FREE_CONNECTORS[id], undefined, `${id} is in the free map`);
      assert.equal(R.catalogue().find((e) => e.source_id === id)?.tier, 'PAID', id);
    }
    assert.ok(PAID_CONNECTORS['HOMEDATA_ADDRESS']);
    // Phase 146k: the title register is looked up by hand. Its connector is retired, in no map a click reads.
    assert.equal(PAID_CONNECTORS['HMLR_TITLE'], undefined, 'the retired title register is still on the click');
    assert.ok(PAID_RETIRED['HMLR_TITLE'], 'the retired connector was deleted rather than retired');
    // The address lookup runs first: everything else is keyed on what it finds.
    assert.equal(Object.keys(PAID_CONNECTORS)[0], 'HOMEDATA_ADDRESS');
  });

  test('EVERY SWITCH IS STILL OFF, THE NEW ONES INCLUDED', () => {
    for (const [k, v] of Object.entries(C.REGISTER_SWITCHES)) assert.equal(v, false, k);
    for (const k of ['HOMEDATA_ADDRESS', 'HMLR_TITLE', 'HOMEDATA_PLANNING', 'BCIS']) {
      assert.ok(Object.hasOwn(C.REGISTER_SWITCHES, k), k);
    }
  });

  test('THE PAID PLANNING ROUTE IS BUILT AND NOT CHOSEN: PlanIt stays the source of record and a click runs one of them', () => {
    assert.ok(PAID_NOT_CHOSEN['HOMEDATA_PLANNING'], 'the route is not built');
    assert.equal(PAID_CONNECTORS['HOMEDATA_PLANNING'], undefined, 'a click would run it');
    assert.equal(C.REGISTER_SWITCHES['HOMEDATA_PLANNING'], false);
    // PlanIt is still what the PLANNING row is consulted at, and it is still FREE.
    assert.equal(FREE_CONNECTORS['PLANNING']?.connector.service_id, 'PLANNING');
    assert.equal(R.catalogue().find((e) => e.source_id === 'PLANNING')?.tier, 'FREE');
    // Its records are written under PLANNING — the register source — not under the supplier's name.
    assert.equal(homedataPlanning.source_id, 'HOMEDATA_PLANNING');
    assert.equal(CALL_POLICIES['HOMEDATA_PLANNING']?.register_source, 'PLANNING');
  });

  test('IT NEEDS THE PAID UPRN AND HAS NO OTHER KEY, so without one nothing is sent', async () => {
    const { app, t, ctx } = await rig({ [`GET ${UPRN_PATH}`]: ok('homedata-planning.json') });
    const none = await C.runConnector(homedataPlanning, ctx, { nation: 'england' as const, uprn: null }, ALLOWED, KEYS, ALL_ON);
    assert.equal(none.state, 'FAILED');
    assert.equal(t.seen.length, 0);
    const run = await C.runConnector(homedataPlanning, ctx, { nation: 'england' as const, uprn: '100091234567' }, ALLOWED, KEYS, ALL_ON);
    assert.equal(run.state, 'FIRED', run.detail);
    assert.equal(run.bundle!.records.length, 2);
    assert.equal(new URL(t.seen[0]!.url).searchParams.get('with'), 'planning_history');
    for (const rec of run.bundle!.records) assert.doesNotThrow(() => assertNoUnauthorisedName(rec));
    app.close();
  });

  test('BCIS STAYS UNBUILT, AND NOBODY NEED RE-CHECK IT EVERY QUARTER', () => {
    const row = STUBS.find((s) => s.id === 'registers')!;
    assert.match(row.what, /BCIS/);
    assert.match(row.what, /23 September 2026/);
    assert.match(row.what, /NO EQUIVALENT EXISTS/);
    // And the warning that goes with it: a modelled sale price is not a build cost.
    assert.match(row.what, /valuation/i);
    assert.match(row.what, /never stand in for/);
    assert.equal(C.REGISTER_SWITCHES['BCIS'], false);
    assert.equal(PAID_CONNECTORS['BCIS'], undefined);
    assert.equal(PAID_NOT_CHOSEN['BCIS'], undefined);
  });

  test('THE SOURCE REGISTER: the addresses settled on a live response, the docs recorded and dated, the whitelist widened', () => {
    const homedata = REGISTER_SOURCES.find((s) => s.source_id === 'HOMEDATA_ADDRESS')!;
    assert.equal(homedata.endpoint, 'https://api.homedata.co.uk/address/', 'the /api form is back');
    for (const f of ['uprn', 'address_line', 'postcode', 'latitude', 'longitude']) assert.ok(homedata.permitted_fields.includes(f), f);
    for (const f of ['usrn', 'toid', 'udprn']) assert.ok(homedata.excluded_fields.includes(f), f);
    const title = REGISTER_SOURCES.find((s) => s.source_id === 'HMLR_TITLE')!;
    for (const f of ['price_paid', 'transaction_date', 'prior_owner_count']) assert.ok(title.permitted_fields.includes(f), f);

    // Every service row this phase added is tied to a documented address, dated.
    for (const service of ['HOMEDATA_ADDRESS', 'HOMEDATA_PLANNING', 'HMLR_TITLE', 'HMLR_TITLE_TEST']) {
      const p = CALL_POLICIES[service]!;
      const d = SUPPLIER_DOCS.find((x) => x.source_id === p.register_source)!;
      assert.ok(d, service);
      assert.equal(d.read_on, '2026-09-23', service);
      assert.ok(d.api_base.includes(p.base_url!), `${service}: ${p.base_url} is not in the docs read`);
    }
  });

  test('THE RATE LIMIT SAYS IT IS STILL A GUESS OF OURS, AND THE RETRY HONOURS Retry-After', async () => {
    assert.match(CALL_POLICIES['HOMEDATA_ADDRESS']!.rate_basis, /NOT PUBLISHED/);
    assert.match(CALL_POLICIES['HOMEDATA_ADDRESS']!.rate_basis, /23 Sep 2026/);
    assert.match(CALL_POLICIES['HOMEDATA_ADDRESS']!.rate_basis, /OUR cautious guess/);
    assert.equal(CALL_POLICIES['HOMEDATA_ADDRESS']!.rate.limit, 100);
    // One key, one limit: the two Homedata rows count against one window, as Companies House's two do.
    assert.equal(CALL_POLICIES['HOMEDATA_ADDRESS']!.rate_bucket, 'HOMEDATA');
    assert.equal(CALL_POLICIES['HOMEDATA_PLANNING']!.rate_bucket, 'HOMEDATA');
    // And the two Land Registry environments share one, so a test run cannot widen the live limit.
    assert.equal(CALL_POLICIES['HMLR_TITLE']!.rate_bucket, CALL_POLICIES['HMLR_TITLE_TEST']!.rate_bucket);

    const waits: number[] = [];
    const app = await testApp();
    const t = fixtureTransport({ 'GET /x': [{ status: 429, body: '{}', headers: { 'retry-after': '7' } }, { status: 200, body: '{}' }] });
    const r = await callOutside(
      { audit: app.audit, now: app.now, transport: t, limiter: new RateLimiter(), sleep: async (ms) => { waits.push(ms); } },
      { service_id: 'HOMEDATA_ADDRESS', endpoint: '/x', actor_id: null, claim_id: null, gate: GATE });
    assert.equal(r.outcome, 'OK');
    assert.deepEqual(waits, [7000], 'the supplier’s Retry-After was not honoured');
    app.close();
  });

  test('A UPRN UPGRADES THE FREE MATCH: the energy certificate lookup takes it as an exact key, as a company number is', async () => {
    const built = FREE_CONNECTORS['EPC']!;
    const subject = { business_id: 'b', name: 'n', company_number: null, sector: 'care_homes', property: PROPERTY };
    const bundle = { records: [], facts: { uprn: '100091234567' } };
    assert.equal((built.query(subject, new Map([['HOMEDATA_ADDRESS', bundle]]), null) as { uprn?: string | null }).uprn, '100091234567');
    assert.equal((built.query(subject, new Map(), null) as { uprn?: string | null }).uprn, null, 'a UPRN appeared from nowhere');

    // With one, the search is made ON it — and a search that finds nothing is an answer about this property.
    const { app, t, ctx } = await rig({ 'GET /api/non-domestic/search': { status: 404, body: '{}' }, 'GET /api/display/search': { status: 404, body: '{}' } });
    const keys = secretsFromValues({ EPC_API_TOKEN: 'epc-fixture-token-146d' });
    const run = await C.runConnector(epc, ctx, { property: PROPERTY, nation: 'england' as const, sector: 'care_homes', uprn: '100091234567' }, ALLOWED, keys, ALL_ON);
    assert.equal(run.state, 'FAILED');
    assert.match(run.detail, /by the property’s own number/);
    for (const s of t.seen) {
      assert.equal(new URL(s.url).searchParams.get('uprn'), '100091234567');
      assert.equal(new URL(s.url).searchParams.has('postcode'), false, 'it fell back to the postcode');
    }
    app.close();
  });
});
