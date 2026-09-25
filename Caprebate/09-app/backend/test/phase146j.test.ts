/**
 * PHASE 146j, 25 September 2026 — TAKING BACK A PICK, OR A YES.
 *
 *   1 · TAKING BACK A PICK. A person who chose the wrong building from a close-match list (Phase 146h) could not undo
 *       it: the lookup read FIRED, left the REVIEW band, and the list was never offered again. `takeBackPick` is the
 *       way back — a separate act on the lookup's row that asks why. It removes the ONE record the pick wrote, found
 *       through `register_match_picks.record_id` and never re-derived; puts the lookup back to FAILED, MATCH_REVIEW;
 *       and keeps the pick row with the reason and who took it back. It refuses where the record is not the pick's to
 *       remove, or where a person has approved a fact from it, and it LISTS what was worked out from the record while
 *       it stood rather than un-deriving it silently.
 *   2a · TAKING A YES BACK. A 'yes' about a name on a client document (Phase 146i) let a reading keep the name; turning
 *       it to 'no' changed nothing written. `withdrawVouch` takes that field — and no other — out of every record it
 *       went into, and keeps the answer, marked withdrawn, with the reason.
 *   2b · ASKING BEFORE THE FIRST READING. The upload forms and the document request ask the question where the type
 *       is chosen, so the first reading can keep the name. One store: a request's answer is the same row, adopted by
 *       the document that answers it. The page's answer governs.
 *
 * Every test runs on recorded answers (test/fixtures/phase146h/ for the register, invented Claude answers for the
 * reader), with no key and no network. Every document and every register entry here is invented.
 */
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes } from 'node:crypto';

import { fixtureTransport, RateLimiter, type Fixture } from '../src/connectors/http.ts';
import * as C from '../src/connectors/registers.ts';
import { secretsFromValues, forgetRegisteredSecretsForTest } from '../src/secrets.ts';
import { inMemoryPostcodeStore, type PostcodeAuthorityTable } from '../src/web/postcode-port.ts';
import * as R from '../src/web/research.ts';
import * as MR from '../src/web/match-review.ts';
import * as TB from '../src/web/take-back.ts';
import { REGISTRY } from '../src/web/engine.ts';
import { signEngagement, SIGNING_QUESTION, shownLetter, type EngagementSigning } from '../src/web/signing.ts';
import { seed } from '../src/seed.ts';
import { createUser, newId } from '../src/users.ts';
import { ingestRegisterRecord, removeRegisterField, removeRegisterRecord } from '../src/stubs/registers.ts';
import { createApp } from '../src/server.ts';
import { CLAUDE_SWITCHES, type ClaudeSwitches } from '../src/connectors/claude.ts';
import { acceptClientBytes, finishUpload, issuedJob, type ReadingOutcome, type UploadDeps, type UploadReading } from '../src/web/uploads.ts';
import * as D from '../src/web/documents.ts';
import { discriminantsFor, earlyVouchesFrom, vouchesFor, vouchView } from '../src/web/document-reading.ts';
import { earlyQuestions } from '../src/web/client-files-pages.ts';
import { docxOf } from './document-fixtures.ts';
import { testApp, actor } from './helpers.ts';
import type { Actor } from '../src/authz.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SRC = join(HERE, '..', 'src');
const fx = (name: string): string => readFileSync(join(HERE, 'fixtures', 'phase146h', name), 'utf8');
const ok = (name: string): Fixture => ({ status: 200, body: fx(name) });
const NOT_FOUND: Fixture = { status: 404, body: '{}' };

afterEach(() => forgetRegisteredSecretsForTest());

/* ================================================================== *
 * THE REGISTER WORLD — a signed client, a lookup in the REVIEW band, and a pick. The same rig as Phase 146h's.
 * ================================================================== */

const KEYS = secretsFromValues({
  COMPANIES_HOUSE_API_KEY: 'ch-fixture-key-146j', CQC_SUBSCRIPTION_KEY: 'cqc-fixture-key-146j', EPC_API_TOKEN: 'epc-fixture-token-146j',
});
const ALL_ON: Readonly<Record<string, boolean>> = Object.freeze(Object.fromEntries(Object.keys(C.REGISTER_SWITCHES).map((k) => [k, true])));
const PICK_ON: Readonly<Record<string, boolean>> = Object.freeze({ MATCH_REVIEW_PICK: true });
const ALLOWED = { state: 'NOT_RUN' as const, detail: 'allowed' };
const CHOSEN = '1111-0000-0000-0000-0011';
const OTHER = '1111-0000-0000-0000-0012';
const REASON = 'Wrong unit. The client is in Unit 4 and this entry is Unit 3.';

const TABLE: PostcodeAuthorityTable = {
  table_id: 'CB_ONS_POSTCODE_AUTHORITY', source: 'HAND-TYPED TEST FIXTURE - not an ONS file', licence: 'n/a - fixture',
  loaded: true, verified_at: '2026-08-15T00:00:00.000Z', release: 'AUG_2026', release_year: 2026, record_count: 1,
  byPostcode: { 'ZZ3 3ZZ': { lad_code: 'E06000999', lad_name: 'Nowhere', country_code: 'E92000001', region_code: 'E12000009', terminated_on: null } },
};
const STORE = inMemoryPostcodeStore(TABLE);
const PICK_FIXTURES = {
  'GET /api/non-domestic/search': NOT_FOUND, 'GET /api/display/search': NOT_FOUND,
  'GET /api/domestic/search': ok('epc-domestic-search-two-close.json'),
  'GET /api/certificate': ok('epc-certificate-domestic-chosen.json'),
  'GET /api/codes': ok('epc-codes.json'),
  'GET /api/codes/info': [ok('epc-codes-info-age-band.json'), ok('epc-codes-info-tenure.json')],
};
const SIGNING_ON: EngagementSigning = Object.freeze({ enabled: true, solicitor_confirmed: true, question: SIGNING_QUESTION });

type TestApp = Awaited<ReturnType<typeof testApp>>;

const staff = (app: TestApp): Actor =>
  actor('ADMIN', app.db.get<{ id: string }>("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY id LIMIT 1")!.id);
const recordIds = (app: TestApp): string[] => app.db.all<{ id: string }>('SELECT id FROM register_records ORDER BY id').map((r) => r.id);

async function signedClient(app: TestApp): Promise<string> {
  const r = await seed(app.db, app.hasher, app.now);
  const id = r.businesses[0]!.id;
  app.db.run("UPDATE businesses SET name = 'Riverside Supported Living', legal_name = NULL, company_number = NULL, sector = 'supported_living' WHERE id = ?", [id]);
  app.db.run("UPDATE properties SET address_line_1 = 'Unit 4 Riverside Business Park', address_line_2 = 'Kelso Place', town = 'Nowhere', postcode = 'ZZ3 3ZZ', jurisdiction = 'england' WHERE business_id = ?", [id]);
  const dir = mkdtempSync(join(tmpdir(), 'cb-146j-letter-'));
  const letterPath = join(dir, 'letter.docx');
  writeFileSync(letterPath, docxOf(['ENGAGEMENT LETTER', '1. Parties', 'This letter is between CAP REBATE LTD and Riverside Supported Living.', '2. Fees', 'Our fee is 3 per cent of the relief.']));
  const existing = app.db.get<{ id: string }>('SELECT id FROM engagements WHERE business_id = ?', [id]);
  if (existing === undefined) {
    app.db.run("INSERT INTO engagements (id, business_id, letter_state, signed_at, created_at) VALUES (?, ?, 'SENT', NULL, ?)", [randomUUID(), id, app.now()]);
  } else {
    app.db.run("UPDATE engagements SET letter_state = 'SENT', signed_at = NULL WHERE id = ?", [existing.id]);
  }
  const user = createUser(app.db, app.now, {
    email: `signer-${randomUUID()}@example.invalid`, display_name: 'Signer', role: 'CLIENT',
    password_hash: await app.hasher.hash('x'), business_id: id,
  });
  const session = randomUUID();
  app.db.run('INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)',
    [session, user.id, randomBytes(16).toString('hex'), app.now(), '2099-01-01T00:00:00.000Z', app.now()]);
  const client: Actor = { id: user.id, role: 'CLIENT', business_id: id, disabled: false };
  const shown = shownLetter({ name: 'Riverside Supported Living' }, letterPath);
  const signed = signEngagement(
    { db: app.db, audit: app.audit, email: app.email, now: app.now, newId: randomUUID }, client, id,
    { full_name: 'Ada Lovelace', role: 'Director', authorised: true, letter_sha256: shown.sha256 },
    { ip: '203.0.113.9', session_id: session }, { cfg: SIGNING_ON, letterPath },
  );
  assert.equal(signed.ok, true, signed.ok ? '' : signed.why);
  return id;
}

function pickDeps(app: TestApp, t: ReturnType<typeof fixtureTransport>, on: boolean): MR.PickDeps {
  return {
    db: app.db, audit: app.audit, now: app.now, newId,
    outside: { transport: t, secrets: KEYS, switches: ALL_ON, postcodeStore: STORE },
    ...(on ? { pick_switches: PICK_ON } : {}),
  };
}

async function withFreeGateOpen<T>(fn: () => Promise<T>): Promise<T> {
  const pre = (REGISTRY as unknown as { precondition: { enabled: boolean } }).precondition;
  pre.enabled = true;
  try { return await fn(); } finally { pre.enabled = false; }
}

async function intoReview(d: MR.PickDeps, id: string): Promise<void> {
  const entry = R.catalogue().find((e) => e.source_id === 'EPC')!;
  const out = await R.consultAllowed(d, actor('ADMIN'), id, [{ entry, ...ALLOWED }], { free_gate_open: true, engagement_signed: true });
  assert.equal(out[0]?.failure_code, 'MATCH_REVIEW', out[0]?.detail ?? 'no outcome');
  d.db.tx(() => R.storeResearchOutcomes(d, id, out, d.now()));
}

type Picked = { app: TestApp; id: string; d: MR.PickDeps; rec: string; me: Actor };

/** A signed client whose energy certificate lookup was close, and a person who chose CHOSEN. */
async function picked(before?: (app: TestApp, id: string) => void): Promise<Picked> {
  const app = await testApp();
  const id = await signedClient(app);
  const d = pickDeps(app, fixtureTransport(PICK_FIXTURES), true);
  await withFreeGateOpen(() => intoReview(d, id));
  before?.(app, id);
  const me = staff(app);
  const took = await withFreeGateOpen(() => MR.takePick(d, me, id, 'EPC', CHOSEN));
  assert.equal(took.ok, true, took.why);
  const rec = app.db.get<{ record_id: string | null }>('SELECT record_id FROM register_match_picks WHERE business_id = ? AND taken_back_at IS NULL', [id])?.record_id ?? '';
  return { app, id, d, rec, me };
}

const pickRows = (app: TestApp, id: string) => app.db.all<{
  chosen_key: string | null; record_id: string | null; removed_record_id: string | null; taken_back_at: string | null;
  taken_back_by: string | null; taken_back_reason: string | null; look_again_json: string | null;
}>('SELECT chosen_key, record_id, removed_record_id, taken_back_at, taken_back_by, taken_back_reason, look_again_json FROM register_match_picks WHERE business_id = ? ORDER BY picked_at, rowid', [id]);

const sourceRow = (app: TestApp, id: string) => app.db.get<{ state: string; failure_code: string | null; retrieved_at: string | null; detail: string }>(
  "SELECT state, failure_code, retrieved_at, detail FROM research_sources WHERE business_id = ? AND source_id = 'EPC'", [id]);

/* ================================================================== *
 * 1 · TAKING BACK A PICK
 * ================================================================== */

describe('1 · taking back a pick: a separate act, with a reason, that removes the one record the pick wrote', () => {
  test('J1 — TAKEN BACK: the one record goes, the lookup is back in the REVIEW band, and the pick row stays with who and why', async () => {
    const { app, id, d, rec, me } = await picked();
    assert.notEqual(rec, '', 'the pick did not record the record it wrote');
    const before = recordIds(app);
    assert.equal(R.sourcesFor(app.db, me, id).sources.find((s) => s.source_id === 'EPC')?.picked, true, 'the panel cannot offer the take-back');

    const r = MR.takeBackPick(d, me, id, 'EPC', REASON);
    assert.deepEqual([r.ok, r.removed], [true, true], r.why);

    // ONE record went, and it is the one the pick wrote; every other record is exactly where it was
    assert.deepEqual(recordIds(app), before.filter((x) => x !== rec));

    // the decision is two facts, not none: the pick row is kept, with who, when, why and what it removed
    const rows = pickRows(app, id);
    assert.equal(rows.length, 1);
    assert.deepEqual([rows[0]?.chosen_key, rows[0]?.record_id, rows[0]?.removed_record_id, rows[0]?.taken_back_by, rows[0]?.taken_back_reason],
      [CHOSEN, null, rec, me.id, REASON]);
    assert.ok(rows[0]?.taken_back_at);

    // the lookup is FAILED, MATCH_REVIEW again, holding no value, so the list can be offered again
    assert.deepEqual([sourceRow(app, id)?.state, sourceRow(app, id)?.failure_code, sourceRow(app, id)?.retrieved_at], ['FAILED', 'MATCH_REVIEW', null]);
    assert.equal(R.sourcesFor(app.db, me, id).sources.find((s) => s.source_id === 'EPC')?.picked, false);
    const again = await withFreeGateOpen(() => MR.offerPick(d, me, id, 'EPC'));
    assert.equal(again.ok, true, again.why);
    assert.ok(again.candidates.some((c) => c.key === CHOSEN));
    assert.deepEqual([again.taken_back?.chosen_key, again.taken_back?.reason], [CHOSEN, REASON], 'the list does not say which entry was taken back');
    assert.equal(again.already, null, 'a taken-back pick still reads as the choice that stands');

    // its own audit kind, carrying the reason — and no address
    const chain = app.audit.entries().filter((e) => e.kind === 'REGISTER_MATCH_TAKEN_BACK');
    assert.equal(chain.length, 1);
    assert.deepEqual([chain[0]?.actor_id, chain[0]?.detail.source_id, chain[0]?.detail.reason, chain[0]?.detail.removed], [me.id, 'EPC', REASON, true]);
    for (const word of ['Riverside', 'Kelso', 'ZZ3 3ZZ', 'RIVERSIDE', CHOSEN]) assert.equal(JSON.stringify(chain[0]).includes(word), false, word);
    assert.equal(app.audit.verify().intact, true);
    app.close();
  });

  test('J2 — CHOOSING AGAIN DOES NOT ERASE THE TAKE-BACK: the taken-back row survives the next pick on the same lookup', async () => {
    const { app, id, d, me } = await picked();
    assert.equal(MR.takeBackPick(d, me, id, 'EPC', REASON).ok, true);
    const next = await withFreeGateOpen(() => MR.takePick(d, me, id, 'EPC', CHOSEN));
    assert.equal(next.ok, true, next.why);
    const rows = pickRows(app, id);
    assert.equal(rows.length, 2, 'the second pick replaced the one that was taken back');
    assert.deepEqual(rows.map((x) => x.taken_back_reason), [REASON, null]);
    assert.equal(MR.lastPick(app.db, id, 'EPC')?.chosen_key, CHOSEN);
    assert.equal(MR.takenBackPicks(app.db, id, 'EPC').length, 1);
    assert.deepEqual(app.audit.entries().filter((e) => e.kind.startsWith('REGISTER_MATCH_')).map((e) => e.kind),
      ['REGISTER_MATCH_PICKED', 'REGISTER_MATCH_TAKEN_BACK', 'REGISTER_MATCH_PICKED']);
    app.close();
  });

  test('J3 — IT ASKS WHY: no reason, or a reason carrying an email address, changes nothing', async () => {
    const { app, id, d, me } = await picked();
    const held = recordIds(app);
    for (const reason of [null, '', '   ', 'ask ops@example.invalid']) {
      const r = MR.takeBackPick(d, me, id, 'EPC', reason);
      assert.equal(r.ok, false, String(reason));
      assert.equal(r.field, 'reason');
    }
    assert.deepEqual(recordIds(app), held);
    assert.equal(pickRows(app, id)[0]?.taken_back_at, null);
    assert.equal(sourceRow(app, id)?.state, 'FIRED');
    assert.equal(app.audit.entries().filter((e) => e.kind === 'REGISTER_MATCH_TAKEN_BACK').length, 0);
    app.close();
  });

  test('J4 — ONLY A PERSON WHO CAN RUN THE RESEARCH, AND ONLY WHILE THE ENGAGEMENT IS SIGNED — the same conditions as the pick', async () => {
    const { app, id, d } = await picked();
    const held = recordIds(app);
    for (const role of ['SURVEYING', 'ACCOUNTING', 'CLIENT'] as const) {
      assert.throws(() => MR.takeBackPick(d, actor(role), id, 'EPC', REASON), `${role} took a pick back`);
    }
    // a client with no signed letter: refused in words, before anything is looked at
    const other = randomUUID();
    app.db.run("INSERT INTO businesses (id, name, sector, stage, created_at) VALUES (?, 'Unsigned Ltd', 'dental', 'ASSESSMENT_SUBMITTED', ?)", [other, app.now()]);
    assert.equal(R.assertSignedEngagement(app.db, other).signed, false);
    const r = MR.takeBackPick(d, staff(app), other, 'EPC', REASON);
    assert.equal(r.ok, false);
    assert.match(r.why, /engagement letter is signed/);
    assert.deepEqual(recordIds(app), held);
    app.close();
  });

  test('J5 — THE PICK SWITCH TURNED OFF DOES NOT LOCK A WRONG CHOICE IN: taking back shows no list and calls nothing', async () => {
    const { app, id, me } = await picked();
    const t = fixtureTransport(PICK_FIXTURES);
    const off = pickDeps(app, t, false);
    const r = MR.takeBackPick(off, me, id, 'EPC', REASON);
    assert.equal(r.ok, true, r.why);
    assert.equal(t.seen.length, 0, 'taking a pick back contacted a register');
    app.close();
  });

  test('J6 — A FACT A PERSON HAS APPROVED DOES NOT VANISH UNDER THEM: refused while ticked, allowed once the tick is off', async () => {
    const { app, id, d, rec, me } = await picked();
    const field = Object.keys(JSON.parse(app.db.get<{ fields_json: string }>('SELECT fields_json FROM register_records WHERE id = ?', [rec])!.fields_json) as object)[0]!;
    app.db.run("INSERT INTO fact_approvals (id, business_id, fact_ref, action, reason, actor_id, at) VALUES (?, ?, ?, 'APPROVED', NULL, ?, ?)",
      [randomUUID(), id, `reg.${rec}.${field}`, me.id, app.now()]);
    assert.deepEqual(TB.approvedFieldsOf(app.db, id, rec), [field]);
    const r = MR.takeBackPick(d, me, id, 'EPC', REASON);
    assert.equal(r.ok, false);
    assert.match(r.why, /checked and approved/);
    assert.match(r.why, /Take the tick off first/);
    assert.ok(recordIds(app).includes(rec), 'an approved fact was taken out from under the person who approved it');

    app.db.run("INSERT INTO fact_approvals (id, business_id, fact_ref, action, reason, actor_id, at) VALUES (?, ?, ?, 'UNAPPROVED', 'wrong building', ?, ?)",
      [randomUUID(), id, `reg.${rec}.${field}`, me.id, app.now()]);
    assert.deepEqual(TB.approvedFieldsOf(app.db, id, rec), []);
    assert.equal(MR.takeBackPick(d, me, id, 'EPC', REASON).ok, true);
    app.close();
  });

  test('J7 — A RECORD ANOTHER LOOKUP WROTE IS NOT THE PICK’S: a pick of an entry already held records no record, and takes nothing out', async () => {
    let planted = '';
    const { app, id, d, me } = await picked((a, biz) => {
      planted = ingestRegisterRecord(a.db, randomUUID, a.now, biz, { sourceId: 'EPC', entityId: CHOSEN, fields: { epc_total_floor_area_m2: 640 } });
    });
    const row = pickRows(app, id)[0];
    assert.equal(row?.record_id, null, 'the pick claimed a record an earlier lookup wrote (the defect this phase fixed in takePick)');
    const r = MR.takeBackPick(d, me, id, 'EPC', REASON);
    assert.equal(r.ok, false);
    assert.match(r.why, /kept nothing of its own/);
    assert.ok(recordIds(app).includes(planted), 'a record another lookup wrote was removed');
    app.close();
  });

  test('J8 — AND A PICK ROW MADE BEFORE THIS PHASE, NAMING A RECORD HELD BEFORE IT, IS REFUSED TOO', async () => {
    const { app, id, d, rec, me } = await picked();
    app.db.run("UPDATE register_records SET obtained_at = '2026-01-01T00:00:00.000Z' WHERE id = ?", [rec]);
    const r = MR.takeBackPick(d, me, id, 'EPC', REASON);
    assert.equal(r.ok, false);
    assert.match(r.why, /before anybody chose it/);
    assert.ok(recordIds(app).includes(rec));
    app.close();
  });

  test('J9 — FOUND THROUGH record_id, NEVER RE-DERIVED: with the chosen key pointing at another held record, only the one the pick wrote goes', async () => {
    const { app, id, d, rec, me } = await picked();
    const decoy = ingestRegisterRecord(app.db, randomUUID, app.now, id, { sourceId: 'EPC', entityId: OTHER, fields: { epc_total_floor_area_m2: 99 } });
    // Tamper with the key the pick names. A take-back that re-derived the record from the key would now remove the decoy.
    app.db.run('UPDATE register_match_picks SET chosen_key = ? WHERE business_id = ?', [OTHER, id]);
    assert.equal(MR.takeBackPick(d, me, id, 'EPC', REASON).ok, true);
    const now = recordIds(app);
    assert.equal(now.includes(rec), false, 'the record the pick wrote is still held');
    assert.equal(now.includes(decoy), true, 'a record was found by its key rather than through the pick');
    app.close();
  });

  test('J10 — WHAT WAS WORKED OUT FROM IT IS LISTED, KEPT AND SHOWN — not un-derived silently', async () => {
    const { app, id, d, rec, me } = await picked();
    const claim = app.db.get<{ id: string }>('SELECT id FROM claims WHERE business_id = ?', [id])!.id;
    const recAt = app.db.get<{ obtained_at: string }>('SELECT obtained_at FROM register_records WHERE id = ?', [rec])!.obtained_at;
    // told the client their property details were checked, after the entry arrived
    app.db.run("INSERT INTO client_step_notices (id, business_id, claim_id, step, action, reason, actor_id, at) VALUES (?, ?, ?, 'PROPERTY', 'TOLD', NULL, ?, ?)",
      [randomUUID(), id, claim, me.id, app.now()]);
    const look = TB.lookAgainAfter(app.db, id, { id: rec, source_id: 'EPC', obtained_at: recAt, property_id: null });
    assert.deepEqual(look.map((l) => [l.kind, l.count]), [['CLIENT_TOLD', 1]]);

    const r = MR.takeBackPick(d, me, id, 'EPC', REASON);
    assert.equal(r.ok, true, r.why);
    assert.deepEqual(r.look_again.map((l) => l.kind), ['CLIENT_TOLD']);
    assert.match(r.why, /One thing was worked out from it/);
    // kept on the pick row as kinds and counts, and on the lookup's own line in words, where the next person sees it
    assert.deepEqual(JSON.parse(pickRows(app, id)[0]?.look_again_json ?? 'null'), [{ kind: 'CLIENT_TOLD', count: 1 }]);
    assert.match(sourceRow(app, id)?.detail ?? '', /take the step back on the checks panel/);
    assert.equal(app.audit.entries().find((e) => e.kind === 'REGISTER_MATCH_TAKEN_BACK')?.detail.look_again, 'CLIENT_TOLD:1');
    // and it outlives the lookup's own line: the next run rewrites that line, and the panel still reads it off the pick
    app.db.run("UPDATE research_sources SET detail = 'close, and not close enough' WHERE business_id = ? AND source_id = 'EPC'", [id]);
    const row = R.sourcesFor(app.db, me, id).sources.find((x) => x.source_id === 'EPC');
    assert.deepEqual([row?.taken_back?.reason, row?.taken_back?.look_again], [REASON, ['a step the client was told was done']]);
    assert.match(readFileSync(join(SRC, 'web', 'engaged-pages.ts'), 'utf8'), /A choice here was taken back \$\{localStamp\(x\.taken_back\.at\)\}/);
    // and nothing it lists was changed: the step still reads as told
    assert.equal(app.db.all("SELECT id FROM client_step_notices WHERE business_id = ? AND action = 'TOLD'", [id]).length, 1);
    app.close();
  });

  test('J11 — THE OTHER THINGS A RECORD FEEDS: a site area from Homedata’s point, the check of who signed, an issued report, a surveyor’s job, a grant', async () => {
    const app = await testApp();
    const id = await signedClient(app);
    const me = staff(app);
    const property = app.db.get<{ id: string }>('SELECT id FROM properties WHERE business_id = ?', [id])!.id;
    const claim = app.db.get<{ id: string }>('SELECT id FROM claims WHERE business_id = ?', [id])!.id;
    const plant = (source: string, entity: string, at: string, prop: string | null = null): string => {
      const rid = randomUUID();
      app.db.run('INSERT INTO register_records (id, business_id, source_id, entity_id, fields_json, obtained_at, property_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [rid, id, source, entity, '{}', at, prop]);
      return rid;
    };
    // a site area worked out BEFORE the Homedata record is not its child; one AFTER is
    plant('HMLR_INSPIRE', `property:${property}`, '2026-09-01T00:00:00.000Z');
    const home = { id: plant('HOMEDATA_ADDRESS', 'uprn-1', '2026-09-02T00:00:00.000Z', property), source_id: 'HOMEDATA_ADDRESS', obtained_at: '2026-09-02T00:00:00.000Z', property_id: property };
    assert.deepEqual(TB.lookAgainAfter(app.db, id, home).filter((l) => l.kind === 'SITE_AREA'), []);
    app.db.run("DELETE FROM register_records WHERE source_id = 'HMLR_INSPIRE'");
    plant('HMLR_INSPIRE', `property:${property}`, '2026-09-03T00:00:00.000Z');
    assert.deepEqual(TB.lookAgainAfter(app.db, id, home).filter((l) => l.kind === 'SITE_AREA').map((l) => l.count), [1]);

    // the check of who signed, made against Companies House after its record arrived
    const eng = app.db.get<{ id: string }>('SELECT id FROM engagements WHERE business_id = ?', [id])!.id;
    const ch = { id: plant('CH_COMPANY', '00000001', '2026-09-02T00:00:00.000Z'), source_id: 'CH_COMPANY', obtained_at: '2026-09-02T00:00:00.000Z', property_id: null };
    app.db.run("INSERT INTO signatory_checks (id, business_id, engagement_id, source, result, reason, checked_at, checked_by) VALUES (?, ?, ?, 'COMPANIES_HOUSE', 'YES', 'CURRENT_DIRECTOR', '2026-09-04T00:00:00.000Z', ?)",
      [randomUUID(), id, eng, me.id]);
    assert.deepEqual(TB.lookAgainAfter(app.db, id, ch).map((l) => l.kind).filter((k) => k === 'SIGNATORY_CHECK'), ['SIGNATORY_CHECK']);
    // an EPC record is not read by the check of who signed, and not by the site area
    const epc = { ...ch, source_id: 'EPC' };
    assert.deepEqual(TB.lookAgainAfter(app.db, id, epc).map((l) => l.kind).filter((k) => k === 'SIGNATORY_CHECK' || k === 'SITE_AREA'), []);

    // a grant recorded from a client document after the name arrived — asked only about the funder's name
    app.db.run("INSERT INTO claim_grants (id, claim_id, kind, payer_class, amount_pence, amount_basis, traced, traced_elements, source_id, note, recorded_by, recorded_at) " +
      "VALUES (?, ?, 'GRANT', 'charity', NULL, 'UNKNOWN', 'UNKNOWN', NULL, 'CLIENT_DOC', NULL, ?, '2026-09-05T00:00:00.000Z')", [randomUUID(), claim, me.id]);
    const doc = { id: 'r', source_id: 'CLIENT_DOC', obtained_at: '2026-09-02T00:00:00.000Z', property_id: null };
    assert.deepEqual(TB.lookAgainAfter(app.db, id, doc, 'grant_funder_name').map((l) => l.kind), ['GRANT_RECORDED']);
    assert.deepEqual(TB.lookAgainAfter(app.db, id, doc, 'brc_issuing_body').map((l) => l.kind), []);
    // the words are for a person, and the kept list carries no words at all
    assert.equal(TB.lookAgainJson(TB.lookAgainAfter(app.db, id, home)), '[{"kind":"SITE_AREA","count":1}]');
    app.close();
  });
});

/* ================================================================== *
 * 2 · THE DOCUMENT READER — THE SAME WORLD AS PHASE 146i'S
 * ================================================================== */

const T = '2026-09-25T09:00:00.000Z';
const FAKE_KEY = 'sk-ant-fixture-key-146j-0000-1111';
const MSG = 'POST /v1/messages';
const ON: ClaudeSwitches = { DOCUMENT_READING: true, SCANNED_PAGES: false };
const FUNDER = 'Ashworth Regional Health Trust';
const GRANT_DOC = ['GRANT FUNDING AGREEMENT', 'GRANT TERMS:', `${FUNDER} agreed to fund the new plant room at the main site.`,
  'The sum is £48,000 and the agreement is dated 4 March 2024.'];
const GRANT_ANSWER = {
  fields: [
    { field_id: 'grant_funder_name', value_json: `"${FUNDER}"`, confidence: 0.95, page: 1, quote_ref: 'GRANT TERMS p1' },
    { field_id: 'grant_amount_pence', value_json: '4800000', confidence: 0.93, page: 1, quote_ref: 'GRANT TERMS p1' },
    { field_id: 'grant_agreement_date', value_json: '"2024-03-04"', confidence: 0.92, page: 1, quote_ref: 'GRANT TERMS p1' },
  ],
};
const BRC_DOC = ['BUILDING REGULATIONS COMPLETION CERTIFICATE', 'CERTIFICATE REFERENCE:', 'Reference BR/2024/1182, issued by Northmoor Borough Council.'];
const BRC_ANSWER = { fields: [{ field_id: 'brc_certificate_reference', value_json: '"BR/2024/1182"', confidence: 0.96, page: 1, quote_ref: 'CERTIFICATE REFERENCE p1' }] };

function answer(content: unknown): Fixture {
  return {
    status: 200,
    body: JSON.stringify({
      id: 'msg_fixture_146j', type: 'message', role: 'assistant', model: 'claude-opus-5',
      content: [{ type: 'text', text: JSON.stringify(content) }],
      stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 500, output_tokens: 60 },
    }),
  };
}

type World = Awaited<ReturnType<typeof boot>>;
async function boot() {
  const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-146j-')) });
  made.app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', ['bz', 'X Ltd', 'dental', 'ASSESSMENT_SUBMITTED', T]);
  for (const [id, role, biz] of [['u-ADMIN', 'ADMIN', null], ['u-SALES', 'SALES', null], ['u-SURVEYING', 'SURVEYING', null], ['u-CLIENT', 'CLIENT', 'bz']] as const) {
    made.app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, `${id}@example.test`, `${id}@example.test`, id, role, 'x', T, T, biz]);
  }
  return { close: made.close, app: made.app, store: made.store };
}
const admin = (): Actor => actor('ADMIN', 'u-ADMIN');
const client = (): Actor => actor('CLIENT', 'u-CLIENT', 'bz');
const docDeps = (w: World) => ({ db: w.app.db, audit: w.app.audit, now: w.app.now, newId: randomUUID });

type RunOpts = {
  doc?: 'GRANT' | 'BRC'; switches?: ClaudeSwitches; logical_document_id?: string; request_id?: string;
  early?: Record<string, string>; who?: Actor;
};
type Ran = { doc_id: string; logical_id: string; reading: ReadingOutcome };

/** One upload through `startDocumentUpload` and `finishUpload`, the way a staff upload runs it. */
async function run(w: World, o: RunOpts = {}): Promise<Ran> {
  const grant = (o.doc ?? 'GRANT') === 'GRANT';
  const reading: UploadReading = {
    transport: fixtureTransport({ [MSG]: answer(grant ? GRANT_ANSWER : BRC_ANSWER) }),
    secrets: secretsFromValues({ ANTHROPIC_API_KEY: FAKE_KEY }),
    switches: o.switches ?? ON, limiter: new RateLimiter(), sleep: async () => {},
    policy_override: { international_transfer_approved: true }, actor_role: 'ADMIN',
    gate: { free_gate_open: false, engagement_signed: true, switched_on: (o.switches ?? ON).DOCUMENT_READING },
  };
  const who = o.who ?? admin();
  const deps: UploadDeps = { db: w.app.db, store: w.store, now: w.app.now, actor: who.id, audit: w.app.audit, newId: randomUUID, reading };
  const early = o.early ?? {};
  const started = await D.startDocumentUpload({ ...docDeps(w), store: w.store }, who, {
    business_id: 'bz',
    type_code: o.logical_document_id === undefined ? (grant ? 'GRANT_FUNDING_AGREEMENT' : 'BUILDING_REGS_COMPLETION') : null,
    logical_document_id: o.logical_document_id ?? null, request_id: o.request_id ?? null, claim_id: null,
    early_vouch: earlyVouchesFrom((n) => early[n]),
  });
  assert.equal(started.ok, true, started.ok ? '' : started.why);
  if (!started.ok) throw new Error('unreachable');
  const token = new URL(started.url, 'http://x').searchParams.get('token') ?? '';
  const job = issuedJob(w.app.db, started.doc_id);
  const written = await acceptClientBytes(deps, { doc_id: started.doc_id, token, bytes: new Uint8Array(docxOf(grant ? GRANT_DOC : BRC_DOC)) });
  assert.equal(written.ok, true);
  const done = await finishUpload(deps, job as NonNullable<typeof job>, written.ok ? written.written_at : T);
  assert.equal(done.error, undefined);
  return { doc_id: started.doc_id, logical_id: started.logical_document_id, reading: done.reading as ReadingOutcome };
}

const recordOf = (w: World, doc_id: string): Record<string, unknown> | null => {
  const r = w.app.db.get<{ fields_json: string }>("SELECT fields_json FROM register_records WHERE source_id = 'CLIENT_DOC' AND entity_id = ?", [doc_id]);
  return r === undefined ? null : JSON.parse(r.fields_json) as Record<string, unknown>;
};
const recordIdOf = (w: World, doc_id: string): string =>
  w.app.db.get<{ id: string }>("SELECT id FROM register_records WHERE source_id = 'CLIENT_DOC' AND entity_id = ?", [doc_id])!.id;
const vouchRows = (w: World) => w.app.db.all<{ id: string; logical_document_id: string | null; request_id: string | null; answer: string; asked_on: string; withdrawn_reason: string | null }>(
  'SELECT id, logical_document_id, request_id, answer, asked_on, withdrawn_reason FROM document_field_vouches ORDER BY answered_at, rowid');
const say = (w: World, logical: string, a: string) => D.vouchDocumentField(docDeps(w), admin(), logical, 'grant_funder_name', a);

describe('2a · taking a yes back: that field, and no other, comes out of what it went into', () => {
  test('W1 — A YES THAT KEPT A NAME, TAKEN BACK: the name leaves the record, the other facts stay, and the answer stays with why', async () => {
    const w = await boot();
    const first = await run(w);
    assert.equal(recordOf(w, first.doc_id)?.['grant_funder_name'], undefined, 'the first reading, unanswered, left the name out');
    assert.equal(say(w, first.logical_id, 'yes').ok, true);
    const second = await run(w, { logical_document_id: first.logical_id });
    const kept = recordOf(w, second.doc_id)!;
    assert.equal(kept['grant_funder_name'], FUNDER, 'the yes did not let the next reading keep the name');

    const r = D.withdrawVouch(docDeps(w), admin(), first.logical_id, 'grant_funder_name', 'The funder is a sole trader, not a trust.');
    assert.equal(r.ok, true, r.ok ? '' : r.why);
    assert.equal(r.ok && r.removed_from, 1);

    // THAT FIELD AND NO OTHER
    const { grant_funder_name: _gone, ...rest } = kept;
    assert.deepEqual(recordOf(w, second.doc_id), rest);
    // the answer stays: still a yes, withdrawn, with the reason and who
    const row = vouchesFor(w.app.db, first.logical_id)[0];
    assert.deepEqual([row?.answer, row?.withdrawn_by, row?.withdrawn_reason], ['yes', 'u-ADMIN', 'The funder is a sole trader, not a trust.']);
    assert.deepEqual(discriminantsFor(w.app.db, second.doc_id), {}, 'a withdrawn yes still tells the reader to keep the name');
    // its own audit kind, the reason, and never the name
    const chain = w.app.audit.entries().filter((e) => e.kind === 'DOCUMENT_FIELD_VOUCH_WITHDRAWN');
    assert.equal(chain.length, 1);
    assert.deepEqual([chain[0]?.detail.field_id, chain[0]?.detail.reason, chain[0]?.detail.records], ['grant_funder_name', 'The funder is a sole trader, not a trust.', 1]);
    assert.equal(w.app.db.all<{ detail: string }>('SELECT detail FROM audit_log').some((x) => x.detail.includes(FUNDER)), false);
    // and the next reading leaves the name out again
    const third = await run(w, { logical_document_id: first.logical_id });
    assert.equal(recordOf(w, third.doc_id)?.['grant_funder_name'], undefined);
    assert.deepEqual(third.reading.left_out, ['grant_funder_name']);
    // the page says so
    const v = vouchView(w.app.db, first.logical_id, 'GRANT_FUNDING_AGREEMENT', true, (x) => x, (u) => u);
    assert.equal(v?.withdrawn?.reason, 'The funder is a sole trader, not a trust.');
    assert.equal(v?.may_withdraw, false);
    assert.match(v?.effect ?? '', /taken back/);
    w.close();
  });

  test('W2 — THE PLAIN "NO" BUTTON WILL NOT DO IT ONCE A NAME IS KEPT, and says what will', async () => {
    const w = await boot();
    const first = await run(w, { early: { vouch_grant_funder_name: 'yes' } });
    assert.equal(recordOf(w, first.doc_id)?.['grant_funder_name'], FUNDER);
    for (const a of ['no', 'not_sure']) {
      const r = say(w, first.logical_id, a);
      assert.equal(r.ok, false, a);
      assert.match(r.ok ? '' : r.why, /Take the yes back/);
    }
    assert.equal(vouchesFor(w.app.db, first.logical_id)[0]?.answer, 'yes');
    assert.equal(recordOf(w, first.doc_id)?.['grant_funder_name'], FUNDER);
    w.close();
  });

  test('W3 — BEFORE ANYTHING WAS KEPT, A YES MAY STILL BE CHANGED FREELY — there is nothing written to take out', async () => {
    const w = await boot();
    const first = await run(w, { switches: CLAUDE_SWITCHES });
    assert.equal(say(w, first.logical_id, 'yes').ok, true);
    assert.equal(say(w, first.logical_id, 'no').ok, true);
    assert.equal(vouchesFor(w.app.db, first.logical_id)[0]?.answer, 'no');
    w.close();
  });

  test('W4 — IT ASKS WHY, ONLY ADMIN AND SALES MAY, AND THERE MUST BE A YES STANDING', async () => {
    const w = await boot();
    const first = await run(w, { early: { vouch_grant_funder_name: 'yes' } });
    for (const reason of [null, '', 'mail me at a@b.invalid']) {
      const r = D.withdrawVouch(docDeps(w), admin(), first.logical_id, 'grant_funder_name', reason);
      assert.equal(r.ok, false);
      assert.equal(!r.ok && r.field, 'reason');
    }
    for (const who of [actor('SURVEYING', 'u-SURVEYING'), client()]) {
      assert.throws(() => D.withdrawVouch(docDeps(w), who, first.logical_id, 'grant_funder_name', 'no'), who.role);
    }
    assert.equal(recordOf(w, first.doc_id)?.['grant_funder_name'], FUNDER);
    assert.equal(D.withdrawVouch(docDeps(w), actor('SALES', 'u-SALES'), first.logical_id, 'grant_funder_name', 'Wrong').ok, true);
    const again = D.withdrawVouch(docDeps(w), admin(), first.logical_id, 'grant_funder_name', 'Again');
    assert.equal(again.ok, false);
    assert.match(again.ok ? '' : again.why, /no yes standing/);
    w.close();
  });

  test('W5 — AN APPROVED NAME DOES NOT VANISH UNDER THE PERSON WHO APPROVED IT; an approval of another field does not block', async () => {
    const w = await boot();
    const first = await run(w, { early: { vouch_grant_funder_name: 'yes' } });
    const rid = recordIdOf(w, first.doc_id);
    const tick = (field: string, action: string): void => {
      w.app.db.run('INSERT INTO fact_approvals (id, business_id, fact_ref, action, reason, actor_id, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [randomUUID(), 'bz', `reg.${rid}.${field}`, action, action === 'UNAPPROVED' ? 'wrong' : null, 'u-ADMIN', w.app.now()]);
    };
    tick('grant_amount_pence', 'APPROVED');
    tick('grant_funder_name', 'APPROVED');
    const r = D.withdrawVouch(docDeps(w), admin(), first.logical_id, 'grant_funder_name', 'Wrong');
    assert.equal(r.ok, false);
    assert.match(r.ok ? '' : r.why, /checked and approved/);
    assert.equal(recordOf(w, first.doc_id)?.['grant_funder_name'], FUNDER);
    tick('grant_funder_name', 'UNAPPROVED');
    assert.equal(D.withdrawVouch(docDeps(w), admin(), first.logical_id, 'grant_funder_name', 'Wrong').ok, true);
    assert.equal(recordOf(w, first.doc_id)?.['grant_amount_pence'], 4800000, 'the approved amount was touched');
    w.close();
  });

  test('W6 — EVERY READING THE YES LET IT INTO: two versions, the name comes out of both and nothing else moves', async () => {
    const w = await boot();
    const one = await run(w, { early: { vouch_grant_funder_name: 'yes' } });
    const two = await run(w, { logical_document_id: one.logical_id });
    const before = [recordOf(w, one.doc_id)!, recordOf(w, two.doc_id)!];
    assert.deepEqual(before.map((f) => f['grant_funder_name']), [FUNDER, FUNDER]);
    const r = D.withdrawVouch(docDeps(w), admin(), one.logical_id, 'grant_funder_name', 'Wrong');
    assert.equal(r.ok && r.removed_from, 2);
    for (const [i, id] of [one.doc_id, two.doc_id].entries()) {
      const { grant_funder_name: _x, ...rest } = before[i]!;
      assert.deepEqual(recordOf(w, id), rest);
    }
    // a new yes afterwards clears the withdrawal, and the next reading keeps the name again
    assert.equal(say(w, one.logical_id, 'yes').ok, true);
    assert.equal(vouchesFor(w.app.db, one.logical_id)[0]?.withdrawn_at, null);
    const three = await run(w, { logical_document_id: one.logical_id });
    assert.equal(recordOf(w, three.doc_id)?.['grant_funder_name'], FUNDER);
    w.close();
  });
});

describe('2b · the question asked before the first reading, where the type is chosen — and still one store', () => {
  test('E1 — ANSWERED ON THE UPLOAD FORM: the FIRST reading keeps the name, and the answer is the document’s, on its own page', async () => {
    const w = await boot();
    const r = await run(w, { early: { vouch_grant_funder_name: 'yes' } });
    assert.equal(recordOf(w, r.doc_id)?.['grant_funder_name'], FUNDER, 'the first reading still left the name out');
    assert.deepEqual(r.reading.left_out, []);
    const rows = vouchRows(w);
    assert.deepEqual(rows.map((x) => [x.logical_document_id, x.request_id, x.answer, x.asked_on]), [[r.logical_id, null, 'yes', 'UPLOAD']]);
    const v = vouchView(w.app.db, r.logical_id, 'GRANT_FUNDING_AGREEMENT', true, (x) => x, (u) => u);
    assert.equal(v?.asked_on, 'when the file was uploaded');
    const audit = w.app.audit.entries().filter((e) => e.kind === 'DOCUMENT_FIELD_VOUCHED');
    assert.deepEqual(audit.map((e) => [e.detail.asked_on, e.detail.answer]), [['UPLOAD', 'yes']]);
    w.close();
  });

  test('E2 — ONLY YES KEEPS IT: no, not sure and "leave it for now" all leave the name out on the first reading (N4)', async () => {
    const w = await boot();
    for (const [a, rowWritten] of [['no', true], ['not_sure', true], ['', false], ['maybe', false]] as const) {
      const r = await run(w, { early: { vouch_grant_funder_name: a } });
      assert.equal(recordOf(w, r.doc_id)?.['grant_funder_name'], undefined, a);
      assert.equal(vouchesFor(w.app.db, r.logical_id).length, rowWritten ? 1 : 0, `${a}: a blank or unknown value was read as an answer`);
    }
    w.close();
  });

  test('E3 — ANSWERED ON THE REQUEST: the SAME ROW is adopted by the file that answers it, before that file is read', async () => {
    const w = await boot();
    const q = D.createDocumentRequest(docDeps(w), admin(), {
      business_id: 'bz', claim_id: null, type_code: 'GRANT_FUNDING_AGREEMENT', why: 'We need the grant terms.', holds_up: 'The grants figure.', due_on: null,
      early_vouch: earlyVouchesFrom((n) => ({ vouch_grant_funder_name: 'yes' } as Record<string, string>)[n]),
    });
    assert.equal(q.ok, true);
    if (!q.ok) return;
    const born = vouchRows(w);
    assert.deepEqual(born.map((x) => [x.logical_document_id, x.request_id, x.answer, x.asked_on]), [[null, q.id, 'yes', 'REQUEST']]);
    assert.equal(D.requestsFor(w.app.db, admin(), { business_id: 'bz' }, T)[0]?.early_answer, 'yes');

    // the client sends it against the request. The client does not vouch: the answer is the staff member's, adopted.
    const r = await run(w, { request_id: q.id, who: client() });
    assert.equal(recordOf(w, r.doc_id)?.['grant_funder_name'], FUNDER, 'the first reading of the requested file left the name out');
    const now = vouchRows(w);
    assert.equal(now.length, 1, 'a second store appeared');
    assert.deepEqual([now[0]?.id, now[0]?.logical_document_id, now[0]?.request_id, now[0]?.asked_on], [born[0]?.id, r.logical_id, q.id, 'REQUEST']);
    w.close();
  });

  test('E4 — A FILE SENT WITHOUT NAMING THE REQUEST adopts the answer of the request it will be received against', async () => {
    const w = await boot();
    const q = D.createDocumentRequest(docDeps(w), admin(), {
      business_id: 'bz', claim_id: null, type_code: 'GRANT_FUNDING_AGREEMENT', why: 'Terms.', holds_up: 'Grants.', due_on: null,
      early_vouch: [{ field_id: 'grant_funder_name', answer: 'yes' }],
    });
    assert.equal(q.ok, true);
    const r = await run(w, { who: client() });
    assert.equal(recordOf(w, r.doc_id)?.['grant_funder_name'], FUNDER);
    assert.equal(w.app.db.get<{ state: string }>('SELECT state FROM client_tasks WHERE id = ?', [q.ok ? q.id : ''])?.state, 'ANSWERED',
      'the request adopted from is not the one received');
    w.close();
  });

  test('E5 — THE PAGE’S ANSWER GOVERNS: a later form’s answer, or a request’s, never replaces an answer the document already has', async () => {
    const w = await boot();
    const first = await run(w, { switches: CLAUDE_SWITCHES });
    assert.equal(say(w, first.logical_id, 'no').ok, true);
    // a new version with an upload answer of yes: ignored
    const two = await run(w, { logical_document_id: first.logical_id, early: { vouch_grant_funder_name: 'yes' } });
    assert.equal(vouchesFor(w.app.db, first.logical_id)[0]?.answer, 'no');
    assert.equal(recordOf(w, two.doc_id)?.['grant_funder_name'], undefined);
    // a request answered yes, and a new version sent against it: not adopted, and the request's row stays its own
    const q = D.createDocumentRequest(docDeps(w), admin(), {
      business_id: 'bz', claim_id: null, type_code: 'GRANT_FUNDING_AGREEMENT', why: 'Terms.', holds_up: 'Grants.', due_on: null,
      early_vouch: [{ field_id: 'grant_funder_name', answer: 'yes' }],
    });
    const three = await run(w, { logical_document_id: first.logical_id, request_id: q.ok ? q.id : '' });
    assert.equal(recordOf(w, three.doc_id)?.['grant_funder_name'], undefined);
    assert.deepEqual(vouchRows(w).map((x) => [x.logical_document_id, x.request_id, x.answer]),
      [[first.logical_id, null, 'no'], [null, q.ok ? q.id : '', 'yes']]);
    w.close();
  });

  test('E6 — ONLY THE QUESTION THE CHOSEN TYPE ASKS, AND ONLY FROM A LOGIN THAT MAY ANSWER IT', async () => {
    const w = await boot();
    // the grant question answered on a certificate's upload: nothing is written
    await run(w, { doc: 'BRC', early: { vouch_grant_funder_name: 'yes' } });
    assert.equal(vouchRows(w).length, 0);
    // the client posting an answer to its own upload: ignored, and the upload still goes through
    const mine = await run(w, { who: client(), early: { vouch_grant_funder_name: 'yes' } });
    assert.equal(vouchRows(w).length, 0, 'a client vouched for their own document');
    assert.equal(recordOf(w, mine.doc_id)?.['grant_funder_name'], undefined);
    w.close();
  });

  test('E7 — THE STAFF FORMS ASK IT, AND ONLY STAFF WHO MAY ANSWER SEE IT; the portal never does', async () => {
    const w = await boot();
    const types = D.receivableTypes(w.app.db);
    const qs = D.earlyQuestionsFor(admin(), 'bz', types);
    assert.deepEqual(qs.map((q) => q.field_id).sort(), ['brc_issuing_body', 'grant_funder_name']);
    assert.deepEqual(D.earlyQuestionsFor(client(), 'bz', types), []);
    assert.deepEqual(D.earlyQuestionsFor(actor('SURVEYING', 'u-SURVEYING'), 'bz', types), []);
    const html = String(earlyQuestions(qs, 'x'));
    assert.match(html, /name="vouch_grant_funder_name" value="yes"/);
    assert.match(html, /name="vouch_grant_funder_name" value="" checked> Leave it for now/);
    // the three staff forms carry it, and the portal's does not
    const pages = readFileSync(join(SRC, 'web', 'documents-pages.ts'), 'utf8');
    assert.equal((pages.match(/earlyQuestions\(p\.early_questions/g) ?? []).length, 2, 'the claim page’s request and upload forms');
    assert.match(readFileSync(join(SRC, 'web', 'client-files-pages.ts'), 'utf8'), /earlyQuestions\(f\.early_questions/);
    // and the form where staff say what a file that came by email is, which hands the answer to the same upload path
    const msgs = readFileSync(join(SRC, 'web', 'messages-pages.ts'), 'utf8');
    assert.match(msgs, /earlyQuestions\(earlyQuestionsFor\(actor, business_id, types\)/);
    assert.match(msgs, /mailboxFor\(d\),\n\s*earlyVouchesFrom\(\(n\) => f\.get\(n\)\)\)/);
    assert.match(readFileSync(join(SRC, 'web', 'inbound-email.ts'), 'utf8'), /claim_id: f\.claim_id, early_vouch \}, part\.bytes\)/);
    assert.doesNotMatch(readFileSync(join(SRC, 'web', 'router.ts'), 'utf8'), /vouch_|earlyQuestions/);
    w.close();
  });
});

/* ================================================================== *
 * 3 · THE STRUCTURE THAT HOLDS BOTH
 * ================================================================== */

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.ts$/.test(n)) out.push(p);
  }
  return out;
}

describe('3 · one door out, the tables that keep both facts, and the routes', () => {
  test('S1 — THE ONE DOOR OUT: only src/stubs/registers.ts deletes or rewrites a register record', () => {
    const hits: string[] = [];
    for (const p of sources(SRC)) {
      // "UPDAT[E]" so the SQL linter does not read this pattern as a statement being built.
      if (/(DELETE\s+FROM|UPDAT[E])\s+register_records/i.test(readFileSync(p, 'utf8'))) hits.push(p.slice(SRC.length));
    }
    assert.deepEqual(hits, ['/stubs/registers.ts']);
  });

  test('S2 — THE DOORS DO ONLY WHAT THEY ARE ASKED: another client’s record, or a field it does not carry, changes nothing', async () => {
    const app = await testApp();
    const id = await signedClient(app);
    const rid = ingestRegisterRecord(app.db, randomUUID, app.now, id, { sourceId: 'EPC', entityId: 'e-1', fields: { epc_total_floor_area_m2: 640, epc_property_type: 'House' } });
    assert.equal(removeRegisterRecord(app.db, 'someone-else', rid), false);
    assert.equal(removeRegisterField(app.db, 'someone-else', rid, 'epc_property_type'), false);
    assert.equal(removeRegisterField(app.db, id, rid, 'epc_tenure'), false);
    assert.equal(removeRegisterField(app.db, id, rid, 'epc_property_type'), true);
    assert.equal(app.db.get<{ fields_json: string }>('SELECT fields_json FROM register_records WHERE id = ?', [rid])?.fields_json, '{"epc_total_floor_area_m2":640}');
    app.close();
  });

  test('S3 — THE TABLES REFUSE HALF A TAKE-BACK: no reason, no person, a second standing pick, a withdrawn "no", an answer about nothing', async () => {
    const { app, id, me } = await picked();
    assert.throws(() => app.db.run('UPDATE register_match_picks SET taken_back_at = ?, taken_back_by = ?, record_id = NULL WHERE business_id = ?', [app.now(), me.id, id]), /CHECK/);
    assert.throws(() => app.db.run('UPDATE register_match_picks SET taken_back_at = ?, taken_back_by = ?, taken_back_reason = ? WHERE business_id = ?', [app.now(), me.id, 'x', id]), /CHECK/,
      'a pick taken back still pointing at a record');
    assert.throws(() => app.db.run('INSERT INTO register_match_picks (id, business_id, source_id, chosen_key, picked_by, picked_at) VALUES (?, ?, ?, ?, ?, ?)',
      [randomUUID(), id, 'EPC', OTHER, me.id, app.now()]), /UNIQUE/);
    app.close();

    const w = await boot();
    const r = await run(w, { switches: CLAUDE_SWITCHES });
    assert.equal(say(w, r.logical_id, 'no').ok, true);
    assert.throws(() => w.app.db.run("UPDATE document_field_vouches SET withdrawn_at = ?, withdrawn_by = 'u-ADMIN', withdrawn_reason = 'x'", [T]), /CHECK/);
    assert.throws(() => w.app.db.run("INSERT INTO document_field_vouches (id, field_id, answer, answered_by, answered_at) VALUES ('v', 'grant_funder_name', 'yes', 'u-ADMIN', ?)", [T]), /CHECK/);
    w.close();
  });

  test('S4 — BOTH TAKE-BACKS ARE POSTS, carry what they need and nothing else, and are drawn only where there is something to take back', () => {
    const engaged = readFileSync(join(SRC, 'web', 'engaged-pages.ts'), 'utf8');
    assert.match(engaged, /research\\\/pick\\\/take-back\$\/\.exec\(path\);\n\s*if \(takeBack && method === 'POST'\)/);
    assert.match(engaged, /MR\.takeBackPick\(deps, actor, id, f\.get\('source_id'\) \?\? '', f\.get\('reason'\)\)/);
    assert.match(engaged, /x\.picked && s\.engagement\.signed \? h`/);
    const docs = readFileSync(join(SRC, 'web', 'documents-pages.ts'), 'utf8');
    assert.match(docs, /vouch\\\/withdraw\$\/\.exec\(path\);\n\s*if \(docWithdraw && method === 'POST'\)/);
    assert.match(docs, /D\.withdrawVouch\(deps, actor, id, f\.get\('field_id'\) \?\? '', f\.get\('reason'\)\)/);
    assert.match(docs, /v\.may_withdraw \? h`/);
  });

  test('S5 — THE REASON PASSES THE AUDIT CHAIN’S SCREEN BEFORE ANYTHING IS WRITTEN', () => {
    assert.deepEqual(TB.takeBackReason('  The wrong unit.  '), { ok: true, reason: 'The wrong unit.' });
    assert.equal(TB.takeBackReason('x@y.invalid').ok, false);
    assert.equal(TB.takeBackReason('x'.repeat(3000)).ok && (TB.takeBackReason('x'.repeat(3000)) as { reason: string }).reason.length, 2000);
  });
});

