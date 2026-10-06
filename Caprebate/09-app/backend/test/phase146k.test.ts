/**
 * PHASE 146k, 25 September 2026 — THE TITLE REGISTER, BY HAND.
 *
 * Lakhbir, 25 September 2026: HM Land Registry's title register "will be done manually and not via API", and the
 * Business Gateway details were taken out of the key file. So:
 *   1 · the Business Gateway connector is RETIRED from "Run the research" — in PAID_RETIRED, in no map a click reads,
 *       never priced into a click, its four keys no longer asked for — and the panel's row says it is done by hand;
 *   2 · a person who bought the official copy records what it says on the property page, through the one door, marked
 *       as entered by hand, with no box for a person's name; and
 *   3 · it can be taken back, with a reason, the way Phase 146j takes back a pick.
 * Every test runs with no key and no network; every value is invented.
 */
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes } from 'node:crypto';

import { fixtureTransport } from '../src/connectors/http.ts';
import * as C from '../src/connectors/registers.ts';
import { PAID_CONNECTORS, PAID_RETIRED, totalBeforePence } from '../src/connectors/paid-registers.ts';
import { SECRET_KEYS, secretsFromValues, forgetRegisteredSecretsForTest } from '../src/secrets.ts';
import * as R from '../src/web/research.ts';
import * as TH from '../src/web/title-by-hand.ts';
import { checksPanel } from '../src/web/approvals.ts';
import { REGISTER_AMOUNTS_WITHHELD } from '../src/web/surveyor.ts';
import { signEngagement, SIGNING_QUESTION, shownLetter, type EngagementSigning } from '../src/web/signing.ts';
import { seed } from '../src/seed.ts';
import { createUser, newId } from '../src/users.ts';
import { docxOf } from './document-fixtures.ts';
import { testApp, actor } from './helpers.ts';
import type { Actor } from '../src/authz.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SRC = join(HERE, '..', 'src');
const BACKEND = join(HERE, '..');
const SIGNING_ON: EngagementSigning = Object.freeze({ enabled: true, solicitor_confirmed: true, question: SIGNING_QUESTION });
type TestApp = Awaited<ReturnType<typeof testApp>>;
afterEach(() => forgetRegisteredSecretsForTest());

const admin = (app: TestApp): Actor =>
  actor('ADMIN', app.db.get<{ id: string }>("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY id LIMIT 1")!.id);
const deps = (app: TestApp) => ({ db: app.db, audit: app.audit, now: app.now, newId: randomUUID });

/** A seeded client, its property in England, and — unless `sign` is false — a letter really signed. */
async function client(sign = true): Promise<{ app: TestApp; id: string; property: string }> {
  const app = await testApp();
  const r = await seed(app.db, app.hasher, app.now);
  const id = r.businesses[0]!.id;
  app.db.run("UPDATE properties SET jurisdiction = 'england' WHERE business_id = ?", [id]);
  const property = app.db.get<{ id: string }>('SELECT id FROM properties WHERE business_id = ?', [id])!.id;
  if (!sign) return { app, id, property };
  const dir = mkdtempSync(join(tmpdir(), 'cb-146k-letter-'));
  const letterPath = join(dir, 'letter.docx');
  writeFileSync(letterPath, docxOf(['ENGAGEMENT LETTER', '1. Parties', 'This letter is between CAP REBATE LTD and the client.', '2. Fees', 'Our fee is 3 per cent.']));
  const existing = app.db.get<{ id: string }>('SELECT id FROM engagements WHERE business_id = ?', [id]);
  if (existing === undefined) {
    app.db.run("INSERT INTO engagements (id, business_id, letter_state, signed_at, created_at) VALUES (?, ?, 'SENT', NULL, ?)", [randomUUID(), id, app.now()]);
  } else {
    app.db.run("UPDATE engagements SET letter_state = 'SENT', signed_at = NULL WHERE id = ?", [existing.id]);
  }
  const user = createUser(app.db, app.now, {
    email: `signer-${randomUUID()}@example.invalid`, display_name: 'Signer', role: 'CLIENT', password_hash: await app.hasher.hash('x'), business_id: id,
  });
  const session = randomUUID();
  app.db.run('INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)',
    [session, user.id, randomBytes(16).toString('hex'), app.now(), '2099-01-01T00:00:00.000Z', app.now()]);
  const signed = signEngagement(
    { db: app.db, audit: app.audit, email: app.email, now: app.now, newId: randomUUID },
    { id: user.id, role: 'CLIENT', business_id: id, disabled: false }, id,
    { full_name: 'Ada Lovelace', role: 'Director', authorised: true, letter_sha256: shownLetter({ name: 'X' }, letterPath).sha256, typed_as_signature: true },
    { ip: '203.0.113.9', session_id: session }, { cfg: SIGNING_ON, letterPath },
  );
  assert.equal(signed.ok, true, signed.ok ? '' : signed.why);
  return { app, id, property };
}

const FULL: TH.TitleForm = {
  title_number: 'wyk 123456', tenure: 'Leasehold', price_paid: '£450,000', transaction_date: '2019-06-11',
  restriction_count: '2', proprietor_company_number: '01234567', prior_owner_count: '3',
};
const titleRecords = (app: TestApp) => app.db.all<{ id: string; entity_id: string; fields_json: string; property_id: string | null }>(
  "SELECT id, entity_id, fields_json, property_id FROM register_records WHERE source_id = 'HMLR_TITLE'");

/* ================================================================== *
 * 1 · RETIRED FROM THE CLICK
 * ================================================================== */

describe('1 · the Business Gateway lookup is retired from "Run the research"', () => {
  test('K1 — IN NO MAP A CLICK READS, NEVER PRICED, AND ITS SWITCH TURNS NOTHING ON', () => {
    assert.equal(PAID_CONNECTORS['HMLR_TITLE'], undefined);
    assert.ok(PAID_RETIRED['HMLR_TITLE'], 'retired, not deleted');
    assert.equal(totalBeforePence(['HMLR_TITLE'], () => true), 0, 'the £7 was priced into a click');
    assert.equal(C.REGISTER_SWITCHES['HMLR_TITLE'], false);
    assert.deepEqual(Object.keys(R.BY_HAND), ['HMLR_TITLE']);
  });

  test('K2 — A SIGNED CLIENT, EVERY SWITCH ON: the click still contacts nobody about the title, and the row says it is done by hand', async () => {
    const { app, id } = await client();
    const t = fixtureTransport({});
    const on = Object.fromEntries(Object.keys(C.REGISTER_SWITCHES).map((k) => [k, true]));
    const panel = R.sourcesFor(app.db, admin(app), id);
    const row = panel.sources.find((s) => s.source_id === 'HMLR_TITLE');
    assert.deepEqual([row?.by_hand, row?.state, row?.may_retry, row?.switched_on], [true, 'NOT_RUN', false, false]);
    assert.match(row?.detail ?? '', /Done by hand, not by a lookup/);
    assert.equal(panel.sources.filter((s) => s.state === 'NOT_RUN' && !s.by_hand).length, panel.would_fire, 'the title register counts as something the click would fire');
    const rowOf = () => JSON.stringify(app.db.get("SELECT * FROM research_sources WHERE business_id = ? AND source_id = 'HMLR_TITLE'", [id]) ?? null);
    const before = rowOf();
    // The retired keys handed in as if they were still in the key file: even so, nothing reaches the Business Gateway.
    const keys = secretsFromValues({ HMLR_BG_USERNAME: 'bg-user-146k', HMLR_BG_PASSWORD: 'bg-pass-146k-0000', HMLR_BG_CERT_PATH: '/nowhere.p12', HMLR_BG_CERT_PASSPHRASE: 'bg-phrase-146k' });
    const out = await R.runResearch({ db: app.db, audit: app.audit, now: app.now, newId, outside: { transport: t, secrets: keys, switches: on } }, admin(app), id);
    assert.equal(out.ok, true, out.why);
    assert.equal(t.seen.some((x) => /landregistry/.test(x.url)), false, 'the Business Gateway was contacted');
    // The seed writes a row for every source in the catalogue; the click must leave this one exactly as it was.
    assert.equal(rowOf(), before, 'the click changed the row of a source it never consults');
    app.close();
  });

  test('K3 — BEFORE SIGNING IT WAITS LIKE ANY PAID SOURCE, and says so rather than asking a person to buy it', async () => {
    const { app, id } = await client(false);
    const row = R.sourcesFor(app.db, admin(app), id).sources.find((s) => s.source_id === 'HMLR_TITLE');
    assert.equal(row?.state, 'NOT_PERMITTED_YET');
    assert.doesNotMatch(row?.detail ?? '', /buy the title register/);
    app.close();
  });

  test('K4 — ITS FOUR KEYS ARE RETIRED: owned by the retired connector, never asked for in the example key file', () => {
    const retired = SECRET_KEYS.filter((k) => k.retired === '146k').map((k) => k.name);
    assert.deepEqual(retired, ['HMLR_BG_USERNAME', 'HMLR_BG_PASSWORD', 'HMLR_BG_CERT_PATH', 'HMLR_BG_CERT_PASSPHRASE']);
    const example = readFileSync(join(BACKEND, 'secrets.example.env'), 'utf8');
    assert.doesNotMatch(example, /^HMLR_BG_/m);
    assert.match(example, /looked up BY HAND since Phase 146k/);
  });
});

/* ================================================================== *
 * 2 · RECORDED BY HAND
 * ================================================================== */

describe('2 · what the official copy says, recorded by hand through the one door', () => {
  test('K5 — RECORDED: one register record, marked by hand, the fields as the whitelist names them, and the person’s act kept', async () => {
    const { app, id, property } = await client();
    const me = admin(app);
    const r = TH.recordTitleByHand(deps(app), me, property, FULL);
    assert.equal(r.ok, true, r.why);
    const recs = titleRecords(app);
    assert.equal(recs.length, 1);
    assert.deepEqual([recs[0]?.entity_id, recs[0]?.property_id], ['by-hand:WYK123456', property]);
    assert.deepEqual(JSON.parse(recs[0]!.fields_json), {
      title_number: 'WYK123456', tenure: 'leasehold', price_paid: 450000, transaction_date: '2019-06-11',
      restriction_count: 2, proprietor_company_number: '01234567', prior_owner_count: 3,
    });
    const row = app.db.get<{ record_id: string; recorded_by: string; title_number: string }>('SELECT record_id, recorded_by, title_number FROM title_by_hand WHERE property_id = ?', [property]);
    assert.deepEqual([row?.record_id, row?.recorded_by, row?.title_number], [recs[0]?.id, me.id, 'WYK123456']);
    // audited with WHICH facts were given, never their values
    const a = app.audit.entries().filter((e) => e.kind === 'TITLE_RECORDED_BY_HAND');
    assert.equal(a.length, 1);
    assert.match(String(a[0]?.detail.fields), /price_paid/);
    assert.equal(JSON.stringify(a[0]).includes('450000'), false, 'a value reached the audit chain');
    // the panel's row reads as looked up, by hand
    const s = R.sourcesFor(app.db, me, id).sources.find((x) => x.source_id === 'HMLR_TITLE');
    assert.deepEqual([s?.state, s?.detail], ['FIRED', R.BY_HAND['HMLR_TITLE']!.done]);
    // the checks panel says who typed it; the surveyor still never gets the price
    const cp = checksPanel(app.db, me, id, app.now().slice(0, 10));
    const facts = [...cp.claims.flatMap((c) => c.steps.flatMap((st) => st.facts)), ...cp.unmatched];
    assert.ok(facts.some((f) => f.chip === 'HM Land Registry, entered by hand'), 'the checks panel does not say it was entered by hand');
    assert.deepEqual(REGISTER_AMOUNTS_WITHHELD['HMLR_TITLE'], ['price_paid']);
    assert.equal(app.audit.verify().intact, true);
    app.close();
  });

  test('K6 — A BLANK BOX IS LEFT OUT, NEVER WRITTEN AS 0 OR "NOT KNOWN" (N4)', async () => {
    const { app, property } = await client();
    assert.equal(TH.recordTitleByHand(deps(app), admin(app), property, { title_number: 'AGL98765' }).ok, true);
    assert.deepEqual(JSON.parse(titleRecords(app)[0]!.fields_json), { title_number: 'AGL98765' });
    app.close();
  });

  test('K7 — NO BOX FOR A PERSON’S NAME: a name handed in anyway is not kept, and the form has no field for one', async () => {
    const { app, property } = await client();
    const form = { ...FULL, proprietor_name_personal: 'Ada Lovelace' } as unknown as TH.TitleForm;
    assert.equal(TH.recordTitleByHand(deps(app), admin(app), property, form).ok, true);
    assert.equal(titleRecords(app)[0]!.fields_json.includes('Lovelace'), false);
    const pages = readFileSync(join(SRC, 'web', 'crm-pages.ts'), 'utf8');
    const block = pages.slice(pages.indexOf('function titleBlock('), pages.indexOf('function propertyPage('));
    assert.doesNotMatch(block, /name="proprietor_name/);
    assert.match(block, /We never type an owner’s name/);
    app.close();
  });

  test('K8 — REFUSED, IN WORDS, AND NOTHING WRITTEN: unsigned, the wrong login, a bad value, the wrong country, one already standing', async () => {
    const unsigned = await client(false);
    const u = TH.recordTitleByHand(deps(unsigned.app), admin(unsigned.app), unsigned.property, FULL);
    assert.equal(u.ok, false);
    assert.match(u.why, /once the engagement letter is signed/);
    assert.equal(titleRecords(unsigned.app).length, 0);
    unsigned.app.close();

    const { app, id, property } = await client();
    for (const role of ['SURVEYING', 'ACCOUNTING', 'CLIENT'] as const) {
      assert.throws(() => TH.recordTitleByHand(deps(app), actor(role, `u-${role}`, id), property, FULL), role);
    }
    for (const [bad, field] of [
      [{ ...FULL, title_number: 'not a title' }, 'title_number'], [{ ...FULL, tenure: 'commonhold' }, 'tenure'],
      [{ ...FULL, price_paid: 'lots' }, 'price_paid'], [{ ...FULL, transaction_date: '2019-02-30x' }, 'transaction_date'],
      [{ ...FULL, proprietor_company_number: '123' }, 'proprietor_company_number'], [{ ...FULL, prior_owner_count: 'three' }, 'prior_owner_count'],
    ] as const) {
      const r = TH.recordTitleByHand(deps(app), admin(app), property, bad);
      assert.equal(r.ok, false, field);
      assert.equal(!r.ok && r.field, field);
    }
    app.db.run("UPDATE properties SET jurisdiction = 'scotland' WHERE id = ?", [property]);
    assert.match(TH.recordTitleByHand(deps(app), admin(app), property, FULL).why, /Registers of Scotland/);
    app.db.run("UPDATE properties SET jurisdiction = 'england' WHERE id = ?", [property]);
    assert.equal(titleRecords(app).length, 0);
    assert.equal(TH.recordTitleByHand(deps(app), admin(app), property, FULL).ok, true);
    const again = TH.recordTitleByHand(deps(app), admin(app), property, { ...FULL, title_number: 'WYK999' });
    assert.match(again.why, /already recorded for this property/);
    assert.equal(titleRecords(app).length, 1);
    app.close();
  });
});

/* ================================================================== *
 * 3 · TAKEN BACK
 * ================================================================== */

describe('3 · a wrong entry is taken back, with a reason, and the entry is kept', () => {
  test('K9 — TAKEN BACK: the one record goes, the entry stays with who and why, and a right one can then be recorded', async () => {
    const { app, id, property } = await client();
    const me = admin(app);
    assert.equal(TH.recordTitleByHand(deps(app), me, property, FULL).ok, true);
    const rec = titleRecords(app)[0]!.id;
    assert.equal(TH.takeBackTitleByHand(deps(app), me, property, '').ok, false, 'taken back without a reason');
    const r = TH.takeBackTitleByHand(deps(app), me, property, 'That is the neighbouring title.');
    assert.equal(r.ok, true, r.why);
    assert.equal(titleRecords(app).length, 0);
    const row = app.db.get<{ record_id: string | null; removed_record_id: string; taken_back_reason: string; taken_back_by: string }>(
      'SELECT record_id, removed_record_id, taken_back_reason, taken_back_by FROM title_by_hand WHERE property_id = ?', [property]);
    assert.deepEqual([row?.record_id, row?.removed_record_id, row?.taken_back_reason, row?.taken_back_by], [null, rec, 'That is the neighbouring title.', me.id]);
    assert.equal(app.audit.entries().filter((e) => e.kind === 'TITLE_BY_HAND_TAKEN_BACK')[0]?.detail.reason, 'That is the neighbouring title.');
    assert.equal(R.sourcesFor(app.db, me, id).sources.find((s) => s.source_id === 'HMLR_TITLE')?.state, 'NOT_RUN');
    assert.equal(TH.recordTitleByHand(deps(app), me, property, { ...FULL, title_number: 'WYK123457' }).ok, true);
    assert.equal(app.db.all('SELECT id FROM title_by_hand WHERE property_id = ?', [property]).length, 2, 'the taken-back entry was replaced');
    const v = TH.titleByHandView(app.db, me, property);
    assert.equal(v?.taken_back[0]?.reason, 'That is the neighbouring title.');
    app.close();
  });

  test('K10 — AN APPROVED FACT IS NOT TAKEN OUT FROM UNDER THE PERSON WHO APPROVED IT', async () => {
    const { app, id, property } = await client();
    const me = admin(app);
    TH.recordTitleByHand(deps(app), me, property, FULL);
    const rec = titleRecords(app)[0]!.id;
    app.db.run("INSERT INTO fact_approvals (id, business_id, fact_ref, action, reason, actor_id, at) VALUES (?, ?, ?, 'APPROVED', NULL, ?, ?)",
      [randomUUID(), id, `reg.${rec}.tenure`, me.id, app.now()]);
    const r = TH.takeBackTitleByHand(deps(app), me, property, 'Wrong title');
    assert.equal(r.ok, false);
    assert.match(r.why, /checked and approved/);
    assert.equal(titleRecords(app).length, 1);
    app.close();
  });

  test('K11 — WHO SEES IT: staff who read register records do; the surveyor and the client do not, because the price is withheld from them', async () => {
    const { app, id, property } = await client();
    TH.recordTitleByHand(deps(app), admin(app), property, FULL);
    const v = TH.titleByHandView(app.db, admin(app), property);
    assert.ok(v?.standing?.lines.some((l) => l.label === 'Price paid' && l.value === '£450,000'));
    assert.equal(v?.may_record, true);
    assert.equal(TH.titleByHandView(app.db, actor('SURVEYING'), property), null);
    assert.equal(TH.titleByHandView(app.db, actor('CLIENT', 'u-CLIENT', id), property), null);
    app.close();
  });

  test('K12 — THE ROUTES ARE POSTS ON THE PROPERTY PAGE, AND CARRY THE FORM AND NOTHING ELSE', () => {
    const pages = readFileSync(join(SRC, 'web', 'crm-pages.ts'), 'utf8');
    assert.match(pages, /title-register\(\\\/take-back\)\?\$\/\.exec\(path\);\n\s*if \(titleHand && method === 'POST'\)/);
    assert.match(pages, /TH\.takeBackTitleByHand\(deps, actor, id, f\.get\('reason'\)\)/);
    assert.match(pages, /title: TH\.titleByHandView\(db, actor, v\.id\)/);
  });
});
