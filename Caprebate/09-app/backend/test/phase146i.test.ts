/**
 * PHASE 146i, 23 September 2026 — THE DOCUMENT READER'S TWO FOLLOW-ONS.
 *
 * 1 · THE TWO FIELDS NOBODY COULD VOUCH FOR. `assertClaimsWritable` refuses `grant_funder_name` and
 *     `brc_issuing_body` unless the caller asserts that the value names an ORGANISATION. Nothing supplied either,
 *     so a grant funding agreement and a building regulations completion certificate had EVERY one of their claims
 *     refused — a document type that could never be captured. A person answers it now, on the document's own page,
 *     and one unvouched field no longer discards the others.
 *
 * 2 · WHAT HAPPENED WHEN WE READ IT. `finishUpload` has reported this since Phase 146g and nothing drew it. The
 *     staff document page draws it now, and only the staff page.
 *
 * EVERY TEST RUNS ON RECORDED ANSWERS (`fixtureTransport`): no key, no network, and NO REAL CLIENT DOCUMENT —
 * every document here is invented. Where a call goes out at all, the transfer is approved through the tests-only
 * `policy_override`; the row in src/connectors/sources.ts stays unapproved.
 *
 * AND THE SWITCH IS STILL OFF. `CLAUDE_SWITCHES.DOCUMENT_READING` is false and this phase does not touch it. The
 * first group proves that a finished upload with the switch off is unchanged by any of this, including that it
 * writes no reading row at all.
 */
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { createApp } from '../src/server.ts';
import { docxOf } from './document-fixtures.ts';
import { secretsFromValues, forgetRegisteredSecretsForTest } from '../src/secrets.ts';
import { fixtureTransport, RateLimiter, type Fixture } from '../src/connectors/http.ts';
import { CLAUDE_SWITCHES, type ClaudeSwitches } from '../src/connectors/claude.ts';
import {
  acceptClientBytes, finishUpload, issuedJob,
  type ReadingOutcome, type UploadDeps, type UploadReading,
} from '../src/web/uploads.ts';
import * as D from '../src/web/documents.ts';
import {
  ANSWER_WORDS, READING_WORDS, VOUCHED_FIELDS, VOUCH_ANSWERS, discriminantsFor, readingIsWorthRecording,
  vouchedFieldFor, vouchesFor,
} from '../src/web/document-reading.ts';
import { assertClaimsWritable } from '../../../04-phase-work/phase3/caprebate-client-doc-ingestion.ts';
import { actor } from './helpers.ts';
import type { Actor } from '../src/authz.ts';

const T = '2026-09-23T09:00:00.000Z';
const FAKE_KEY = 'sk-ant-fixture-key-146i-0000-1111';
const MSG = 'POST /v1/messages';
const ON: ClaudeSwitches = { DOCUMENT_READING: true, SCANNED_PAGES: false };
const APPROVED = { international_transfer_approved: true } as const;

afterEach(() => forgetRegisteredSecretsForTest());

/* ------------------------------------------------------------------ *
 * TWO INVENTED DOCUMENTS, ONE PER CONDITIONAL FIELD.
 *
 * The funder and the issuing body are invented ORGANISATIONS, because that is the case the control is about: a name
 * that is fine to keep and that nothing in the build can tell from a person's. No real client document is used.
 * ------------------------------------------------------------------ */

const FUNDER = 'Ashworth Regional Health Trust';
const GRANT_DOC = [
  'GRANT FUNDING AGREEMENT',
  'GRANT TERMS:',
  `${FUNDER} agreed to fund the new plant room at the main site.`,
  'The sum is £48,000 and the agreement is dated 4 March 2024.',
  'ITEMISED SCHEDULE:',
  'Air handling unit £31,000. Ductwork and controls £17,000.',
];

const GRANT_ANSWER = {
  fields: [
    { field_id: 'grant_funder_name', value_json: `"${FUNDER}"`, confidence: 0.95, page: 1, quote_ref: 'GRANT TERMS p1' },
    { field_id: 'grant_amount_pence', value_json: '4800000', confidence: 0.93, page: 1, quote_ref: 'GRANT TERMS p1' },
    { field_id: 'grant_agreement_date', value_json: '"2024-03-04"', confidence: 0.92, page: 1, quote_ref: 'GRANT TERMS p1' },
  ],
};

const ISSUER = 'Northmoor Borough Council';
const BRC_DOC = [
  'BUILDING REGULATIONS COMPLETION CERTIFICATE',
  'CERTIFICATE REFERENCE:',
  `Reference BR/2024/1182, issued by ${ISSUER} for the plant room works.`,
  'The works were completed on 12 June 2024.',
];

const BRC_ANSWER = {
  fields: [
    { field_id: 'brc_issuing_body', value_json: `"${ISSUER}"`, confidence: 0.94, page: 1, quote_ref: 'CERTIFICATE REFERENCE p1' },
    { field_id: 'brc_certificate_reference', value_json: '"BR/2024/1182"', confidence: 0.96, page: 1, quote_ref: 'CERTIFICATE REFERENCE p1' },
    { field_id: 'brc_completion_date', value_json: '"2024-06-12"', confidence: 0.9, page: 1, quote_ref: 'CERTIFICATE REFERENCE p1' },
  ],
};

function answer(content: unknown): Fixture {
  return {
    status: 200,
    body: JSON.stringify({
      id: 'msg_fixture_146i', type: 'message', role: 'assistant', model: 'claude-opus-5',
      content: [{ type: 'text', text: JSON.stringify(content) }],
      stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 500, output_tokens: 60 },
    }),
  };
}

/* ------------------------------------------------------------------ *
 * THE WORLD — one company, one client and the three staff logins this phase touches.
 * ------------------------------------------------------------------ */

type World = Awaited<ReturnType<typeof boot>>;

async function boot(): Promise<{
  close(): void;
  app: Awaited<ReturnType<typeof createApp>>['app'];
  store: Awaited<ReturnType<typeof createApp>>['store'];
}> {
  const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-146i-')) });
  made.app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)',
    ['bz', 'X Ltd', 'dental', 'ASSESSMENT_SUBMITTED', T]);
  for (const [id, role, biz] of [
    ['u-ADMIN', 'ADMIN', null], ['u-SALES', 'SALES', null], ['u-SURVEYING', 'SURVEYING', null],
    ['u-CLIENT', 'CLIENT', 'bz'],
  ] as const) {
    made.app.db.run(
      'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) '
        + 'VALUES (?,?,?,?,?,?,?,?,?)',
      [id, `${id}@example.test`, `${id}@example.test`, id, role, 'x', T, T, biz]);
  }
  return { close: made.close, app: made.app, store: made.store };
}

const admin = (): Actor => actor('ADMIN', 'u-ADMIN');
const sales = (): Actor => actor('SALES', 'u-SALES');

type Opts = {
  doc?: 'GRANT' | 'BRC';
  switches?: ClaudeSwitches;
  /** A caller saying it instead of a person: the tests-only path, and it must still win. */
  discriminants?: UploadReading['discriminants'];
  noReader?: boolean;
  /** A NEW VERSION of a document already there, which is how the same document is read a second time. */
  logical_document_id?: string;
  shown_to_client?: boolean;
};

type Ran = {
  doc_id: string;
  logical_id: string;
  reading: ReadingOutcome;
  records: () => { source_id: string; entity_id: string; fields_json: string }[];
  readingRows: () => { state: string; why: string; fields: number; not_found: number; left_out: number }[];
  everyDetail: () => string;
};

/**
 * ONE UPLOAD, THE WAY A STAFF UPLOAD RUNS IT — `startDocumentUpload` first, so the upload has a LOGICAL document
 * and therefore somewhere for a person's answer to live.
 */
async function run(w: World, o: Opts = {}): Promise<Ran> {
  const grant = (o.doc ?? 'GRANT') === 'GRANT';
  const t = fixtureTransport({ [MSG]: answer(grant ? GRANT_ANSWER : BRC_ANSWER) });
  const reading: UploadReading | undefined = o.noReader === true ? undefined : {
    transport: t,
    secrets: secretsFromValues({ ANTHROPIC_API_KEY: FAKE_KEY }),
    switches: o.switches ?? CLAUDE_SWITCHES,
    limiter: new RateLimiter(), sleep: async () => {},
    policy_override: APPROVED,
    actor_role: 'ADMIN',
    gate: { free_gate_open: false, engagement_signed: true, switched_on: (o.switches ?? CLAUDE_SWITCHES).DOCUMENT_READING },
    ...(o.discriminants === undefined ? {} : { discriminants: o.discriminants }),
  };
  const deps: UploadDeps = {
    db: w.app.db, store: w.store, now: w.app.now, actor: 'u-ADMIN', audit: w.app.audit, newId: randomUUID,
    ...(reading === undefined ? {} : { reading }),
  };
  const started = await D.startDocumentUpload(
    { db: w.app.db, audit: w.app.audit, now: w.app.now, newId: randomUUID, store: w.store }, admin(),
    {
      business_id: 'bz',
      type_code: o.logical_document_id === undefined ? (grant ? 'GRANT_FUNDING_AGREEMENT' : 'BUILDING_REGS_COMPLETION') : null,
      logical_document_id: o.logical_document_id ?? null, request_id: null, claim_id: null,
      ...(o.shown_to_client === undefined ? {} : { shown_to_client: o.shown_to_client }),
    },
  );
  assert.equal(started.ok, true, 'the upload must start');
  if (!started.ok) throw new Error('unreachable');
  const token = new URL(started.url, 'http://x').searchParams.get('token') ?? '';
  const job = issuedJob(w.app.db, started.doc_id);
  assert.notEqual(job, null);
  const written = await acceptClientBytes(deps, {
    doc_id: started.doc_id, token, bytes: new Uint8Array(docxOf(grant ? GRANT_DOC : BRC_DOC)),
  });
  assert.equal(written.ok, true, 'the invented document must pass the sniffer');
  const done = await finishUpload(deps, job as NonNullable<typeof job>, written.ok ? written.written_at : T);
  assert.equal(done.error, undefined, 'the upload itself must not fail');
  return {
    doc_id: started.doc_id, logical_id: started.logical_document_id,
    reading: done.reading as ReadingOutcome,
    records: () => w.app.db.all('SELECT source_id, entity_id, fields_json FROM register_records ORDER BY rowid'),
    readingRows: () => w.app.db.all('SELECT state, why, fields, not_found, left_out FROM document_readings ORDER BY at'),
    everyDetail: () => w.app.db.all<{ detail: string }>('SELECT detail FROM audit_log').map((r) => r.detail).join('\n'),
  };
}

function fieldsOf(r: Ran): Record<string, unknown> {
  const rows = r.records();
  const last = rows[rows.length - 1];
  return last === undefined ? {} : (JSON.parse(last.fields_json) as Record<string, unknown>);
}

function vouch(w: World, r: Ran, a: string, who: Actor = admin()): { ok: boolean; why?: string } {
  const field = vouchedFieldFor(w.app.db.get<{ handler_type: string | null }>(
    'SELECT t.handler_type FROM logical_documents l JOIN document_types t ON t.code = l.type_code WHERE l.id = ?',
    [r.logical_id])?.handler_type ?? null);
  assert.notEqual(field, null, 'this kind of document must carry a field to vouch for');
  return D.vouchDocumentField(
    { db: w.app.db, audit: w.app.audit, now: w.app.now, newId: randomUUID }, who, r.logical_id,
    (field as NonNullable<typeof field>).field_id, a);
}

/* ================================================================== *
 * 1 · THE SWITCH IS STILL OFF, AND OFF NOTHING HERE HAPPENS
 * ================================================================== */

describe('switched off, none of this phase runs', () => {
  test('I1 — the shipped switch is still false and still frozen', () => {
    assert.deepEqual(CLAUDE_SWITCHES, { DOCUMENT_READING: false, SCANNED_PAGES: false });
    assert.equal(Object.isFrozen(CLAUDE_SWITCHES), true);
  });

  test('I2 — no reading row is written for a reading that never started', async () => {
    const w = await boot();
    const off = await run(w, {});
    assert.equal(off.reading.state, 'SWITCHED_OFF');
    assert.deepEqual(off.readingRows(), [], 'the switch being off must leave the row count exactly where it was');
    const none = await run(w, { noReader: true });
    assert.equal(none.reading.state, 'NOT_WIRED');
    assert.deepEqual(none.readingRows(), []);
    w.close();
  });

  test('I3 — the two states that write no row are named, and every other state does write one', () => {
    for (const s of ['NOT_WIRED', 'SWITCHED_OFF'] as const) assert.equal(readingIsWorthRecording(s), false, s);
    for (const s of ['NOT_CONFIGURED', 'HUMAN_ONLY', 'NOT_READY', 'NOT_READ', 'NOT_WRITTEN', 'CLAIMED'] as const) {
      assert.equal(readingIsWorthRecording(s), true, s);
    }
    assert.deepEqual(Object.keys(READING_WORDS).sort(), [
      'CLAIMED', 'HUMAN_ONLY', 'NOT_CONFIGURED', 'NOT_READ', 'NOT_READY', 'NOT_WIRED', 'NOT_WRITTEN', 'SWITCHED_OFF',
    ], 'every state a reading can end in has words for it');
  });

  test('I4 — with the switch off the page says we have not tried, which is not the same as "we tried and failed"', async () => {
    const w = await boot();
    const r = await run(w, {});
    const p = D.documentPage({ db: w.app.db, audit: w.app.audit, now: w.app.now }, admin(), r.logical_id, 'page', T);
    assert.deepEqual(p.readings, []);
    w.close();
  });
});

/* ================================================================== *
 * 2 · ONE UNVOUCHED FIELD NO LONGER DISCARDS THE OTHERS
 * ================================================================== */

describe('the two fields nobody can vouch for', () => {
  test('I5 — THE CONTROL ITSELF IS UNTOUCHED: the ingestion module still refuses an unvouched field', () => {
    for (const f of VOUCHED_FIELDS) {
      assert.throws(() => assertClaimsWritable([{ field_id: f.field_id, source_id: 'CLIENT_DOC' }], {}),
        /E_CONDITIONAL_FIELD_UNDISCRIMINATED/, f.field_id);
      assert.doesNotThrow(() => assertClaimsWritable([{ field_id: f.field_id, source_id: 'CLIENT_DOC' }], { [f.flag]: true }));
      // and it is the FLAG that unlocks it, not merely any truthy answer
      assert.throws(() => assertClaimsWritable([{ field_id: f.field_id, source_id: 'CLIENT_DOC' }], { [f.flag]: false }),
        /E_CONDITIONAL_FIELD_UNDISCRIMINATED/);
    }
    /* AND THIS IS THE DEFECT ITSELF, still there and still correct where it belongs: the refusal is for the WHOLE
       set of claims, so one unvouched field took a perfectly good one down with it. Until this phase that set was
       everything the document answered, and `readAndClaim` handed it straight over. The fix is that the unvouched
       field never reaches here, not that this stops refusing. */
    assert.throws(() => assertClaimsWritable([
      { field_id: 'grant_funder_name', source_id: 'CLIENT_DOC' },
      { field_id: 'grant_amount_pence', source_id: 'CLIENT_DOC' },
    ], {}), /E_CONDITIONAL_FIELD_UNDISCRIMINATED/);
    assert.doesNotThrow(() => assertClaimsWritable([{ field_id: 'grant_amount_pence', source_id: 'CLIENT_DOC' }], {}),
      'and on its own the other field was always writable — which is what this phase gets back');
  });

  test('I6 — the question list and the control list name the SAME two fields and the same two flags', () => {
    const src = readFileSync(join(import.meta.dirname, '../../../04-phase-work/phase3/caprebate-client-doc-ingestion.ts'), 'utf8');
    const block = /const CONDITIONAL_FIELDS[\s\S]*?\n\];/.exec(src)?.[0] ?? '';
    assert.notEqual(block, '', 'CONDITIONAL_FIELDS must still be the control');
    const fields = [...block.matchAll(/field:\s*'([a-z_]+)'/g)].map((m) => m[1]).sort();
    const flags = [...block.matchAll(/flag:\s*'([a-z_]+)'/g)].map((m) => m[1]).sort();
    assert.deepEqual(fields, VOUCHED_FIELDS.map((f) => f.field_id).sort(),
      'a third conditional field cannot be added to the control and asked about nowhere');
    assert.deepEqual(flags, VOUCHED_FIELDS.map((f) => f.flag).sort());
  });

  test('I7 — unvouched: the funder name is left out and every OTHER claim of the document survives', async () => {
    const w = await boot();
    const r = await run(w, { switches: ON });
    assert.equal(r.reading.state, 'CLAIMED', 'before this phase the whole document was refused');
    assert.deepEqual([...r.reading.left_out], ['grant_funder_name']);
    const kept = fieldsOf(r);
    assert.equal('grant_funder_name' in kept, false, 'the one field nobody vouched for');
    assert.equal(kept['grant_amount_pence'], 4800000);
    assert.equal(kept['grant_agreement_date'], '2024-03-04');
    assert.equal(r.reading.fields, 2, 'two of the three answers were kept');
    w.close();
  });

  test('I8 — THE NAME IS NOWHERE: not in the register, not in the reading row, not in an audit row', async () => {
    const w = await boot();
    const r = await run(w, { switches: ON });
    assert.equal(JSON.stringify(r.records()).includes(FUNDER), false, 'the register never held it');
    assert.equal(JSON.stringify(r.readingRows()).includes(FUNDER), false, 'the reading row never held it');
    assert.equal(r.everyDetail().includes(FUNDER), false, 'no audit row held it');
    w.close();
  });

  test('I9 — a person answers yes on the page, the NEXT reading keeps the name', async () => {
    const w = await boot();
    const first = await run(w, { switches: ON });
    assert.deepEqual([...first.reading.left_out], ['grant_funder_name']);
    assert.equal(vouch(w, first, 'yes').ok, true);
    assert.deepEqual(discriminantsFor(w.app.db, first.doc_id), { funder_is_body: true });

    // THE SAME DOCUMENT, SENT AGAIN — a new version of it, which is the only way a document is read twice. The
    // answer stands, and nothing was passed in: the reading reads what the person recorded on the page.
    const again = await run(w, { switches: ON, logical_document_id: first.logical_id });
    assert.equal(again.logical_id, first.logical_id, 'the second upload is a version of the first document');
    assert.deepEqual([...again.reading.left_out], []);
    assert.equal(fieldsOf(again)['grant_funder_name'], FUNDER);
    assert.equal(again.reading.fields, 3);
    w.close();
  });

  test('I10 — N4: no, not sure, and never asked all behave IDENTICALLY', async () => {
    const outcomes: { left_out: readonly string[]; fields: number; state: string }[] = [];
    for (const a of [null, 'no', 'not_sure'] as const) {
      const w = await boot();
      const seed = await run(w, {});               // switched off, so nothing is read: this is only to make a document
      if (a !== null) assert.equal(vouch(w, seed, a).ok, true);
      // a second version of that same document, read for real: whatever the person answered is what governs it
      const r = await run(w, { switches: ON, logical_document_id: seed.logical_id });
      outcomes.push({ left_out: r.reading.left_out, fields: r.reading.fields, state: r.reading.state });
      w.close();
    }
    assert.deepEqual(outcomes[1], outcomes[0], '"no" and never asked are the same decision');
    assert.deepEqual(outcomes[2], outcomes[0], '"not sure" and never asked are the same decision');
    assert.deepEqual([...(outcomes[0]?.left_out ?? [])], ['grant_funder_name']);
  });

  test('I11 — the same, for the building regulations certificate and its own field', async () => {
    const w = await boot();
    const r = await run(w, { doc: 'BRC', switches: ON });
    assert.equal(r.reading.state, 'CLAIMED');
    assert.deepEqual([...r.reading.left_out], ['brc_issuing_body']);
    const kept = fieldsOf(r);
    assert.equal('brc_issuing_body' in kept, false);
    assert.equal(kept['brc_certificate_reference'], 'BR/2024/1182');
    assert.equal(JSON.stringify(r.records()).includes(ISSUER), false);

    const vouched = await run(w, { doc: 'BRC', switches: ON, discriminants: { issuing_body_is_organisation: true } });
    assert.deepEqual([...vouched.reading.left_out], []);
    assert.equal(fieldsOf(vouched)['brc_issuing_body'], ISSUER);
    w.close();
  });

  test('I12 — a document with NO conditional field is untouched by any of this', async () => {
    const w = await boot();
    const r = await run(w, { switches: ON, doc: 'GRANT', discriminants: { funder_is_body: true } });
    assert.deepEqual([...r.reading.left_out], []);
    assert.equal(vouchedFieldFor('PLANNING'), null, 'no other type carries one');
    assert.equal(vouchedFieldFor(null), null);
    w.close();
  });

  test('I13 — the reason says, in plain words, what was left out and why', async () => {
    const w = await boot();
    const r = await run(w, { switches: ON });
    assert.match(r.reading.why, /left out the name of whoever paid the grant/);
    assert.match(r.reading.why, /nobody has told us it is an organisation/);
    assert.equal(/[A-Z_]{6,}/.test(r.reading.why), false, 'no code reaches the sentence a person reads');
    w.close();
  });
});

/* ================================================================== *
 * 3 · WHO MAY ANSWER, AND WHAT IS WRITTEN DOWN
 * ================================================================== */

describe('a person says whether a name belongs to an organisation', () => {
  test('I14 — Admin and Sales may answer; a surveyor and the client may not', async () => {
    const w = await boot();
    const r = await run(w, {});
    assert.equal(vouch(w, r, 'yes', admin()).ok, true);
    assert.equal(vouch(w, r, 'no', sales()).ok, true);
    for (const who of [actor('SURVEYING', 'u-SURVEYING'), actor('CLIENT', 'u-CLIENT', 'bz'), actor('ACCOUNTING', 'u-ACCOUNTING'), actor('READ_ONLY', 'u-READ')]) {
      assert.throws(() => vouch(w, r, 'yes', who), /not|refus/i, who.role);
    }
    w.close();
  });

  test('I15 — the answer is a row, and the audit row carries the field, the answer and what it replaced — never the name', async () => {
    const w = await boot();
    const r = await run(w, {});
    assert.equal(vouch(w, r, 'not_sure').ok, true);
    assert.equal(vouch(w, r, 'yes').ok, true);
    const rows = vouchesFor(w.app.db, r.logical_id);
    assert.equal(rows.length, 1, 'a later answer replaces the earlier one');
    assert.equal(rows[0]?.answer, 'yes');
    assert.equal(rows[0]?.answered_by, 'u-ADMIN');

    const audit = w.app.db.all<{ detail: string; actor_id: string }>(
      "SELECT detail, actor_id FROM audit_log WHERE kind = 'DOCUMENT_FIELD_VOUCHED' ORDER BY seq");
    assert.equal(audit.length, 2, 'the chain keeps both, in order');
    assert.match(audit[0]?.detail ?? '', /"answer":"not_sure"/);
    assert.match(audit[1]?.detail ?? '', /"answer":"yes"/);
    assert.match(audit[1]?.detail ?? '', /"was":"not_sure"/);
    assert.equal((audit[1]?.detail ?? '').includes(FUNDER), false, 'the value itself is never logged');
    w.close();
  });

  test('I16 — an answer that is not one of the three is refused, and so is a field of another type', async () => {
    const w = await boot();
    const r = await run(w, {});
    const deps = { db: w.app.db, audit: w.app.audit, now: w.app.now, newId: randomUUID };
    assert.equal(D.vouchDocumentField(deps, admin(), r.logical_id, 'grant_funder_name', 'probably').ok, false);
    assert.equal(D.vouchDocumentField(deps, admin(), r.logical_id, 'grant_funder_name', null).ok, false);
    assert.equal(D.vouchDocumentField(deps, admin(), r.logical_id, 'brc_issuing_body', 'yes').ok, false,
      'that field belongs to a different kind of document');
    assert.deepEqual(vouchesFor(w.app.db, r.logical_id), [], 'a refused answer writes nothing');
    assert.deepEqual(VOUCH_ANSWERS.map((a) => ANSWER_WORDS[a]), ['Yes', 'No', 'Not sure']);
    w.close();
  });

  test('I17 — the question is on the page for the two kinds that carry one, and on no other', async () => {
    const w = await boot();
    const r = await run(w, {});
    const deps = { db: w.app.db, audit: w.app.audit, now: w.app.now };
    const before = D.documentPage(deps, admin(), r.logical_id, 'page', T);
    assert.notEqual(before.vouch, null);
    assert.equal(before.vouch?.answer, null);
    assert.match(before.vouch?.question ?? '', /organisation/);
    assert.equal(before.vouch?.may_answer, true);
    assert.match(before.vouch?.effect ?? '', /leave it out/);

    assert.equal(vouch(w, r, 'yes').ok, true);
    const after = D.documentPage(deps, admin(), r.logical_id, 'page', T);
    assert.equal(after.vouch?.answer, 'yes');
    assert.equal(after.vouch?.by, 'staff (admin)', 'a role, never a person’s name');
    assert.match(after.vouch?.effect ?? '', /We keep it/);
    w.close();
  });
});

/* ================================================================== *
 * 4 · WHAT HAPPENED WHEN WE READ IT, ON A SCREEN
 * ================================================================== */

describe('when a reading does not work, a screen says so', () => {
  test('I18 — a reading that worked is one row, with its counts and its reason', async () => {
    const w = await boot();
    const r = await run(w, { switches: ON });
    const rows = r.readingRows();
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.state, 'CLAIMED');
    assert.equal(rows[0]?.fields, 2);
    assert.equal(rows[0]?.left_out, 1);
    assert.match(rows[0]?.why ?? '', /left out/);
    w.close();
  });

  test('I19 — a reading that did NOT work is drawn on the staff page, in words, with the reason', async () => {
    const w = await boot();
    const r = await run(w, { switches: ON, doc: 'GRANT' });
    // the service answers with something we cannot use: nothing is kept, and the page must say why
    w.app.db.run('UPDATE document_readings SET state = ?, why = ?, fields = 0, left_out = 0',
      ['NOT_READ', 'nothing was kept from this document: the answer was not in the form asked for']);
    const p = D.documentPage({ db: w.app.db, audit: w.app.audit, now: w.app.now }, admin(), r.logical_id, 'page', T);
    assert.equal(p.readings.length, 1);
    assert.equal(p.readings[0]?.label, 'We could not read it');
    assert.equal(p.readings[0]?.worked, false);
    assert.match(p.readings[0]?.why ?? '', /the answer was not in the form asked for/);
    assert.equal(p.readings[0]?.version_no, 1);
    w.close();
  });

  test('I20 — a state this build has never heard of is drawn as itself, not dropped', async () => {
    const w = await boot();
    const r = await run(w, { switches: ON });
    w.app.db.run('UPDATE document_readings SET state = ?', ['SOMETHING_NEW']);
    const p = D.documentPage({ db: w.app.db, audit: w.app.audit, now: w.app.now }, admin(), r.logical_id, 'page', T);
    assert.equal(p.readings[0]?.label, 'SOMETHING_NEW');
    w.close();
  });

  test('I21 — THE CLIENT IS SHOWN NEITHER: no reading rows and no question', async () => {
    const w = await boot();
    const r = await run(w, { switches: ON, shown_to_client: true });
    const p = D.documentPage({ db: w.app.db, audit: w.app.audit, now: w.app.now },
      actor('CLIENT', 'u-CLIENT', 'bz'), r.logical_id, 'page', T);
    assert.deepEqual(p.readings, [], 'why our reader could not read something is ours, not the client’s');
    assert.equal(p.vouch, null);
    w.close();
  });

  test('I22 — every reading of every version is listed, newest first', async () => {
    const w = await boot();
    const first = await run(w, { switches: ON });
    w.app.db.run('INSERT INTO document_readings (id, document_id, at, state, why, fields, not_found, left_out) VALUES (?,?,?,?,?,?,?,?)',
      [randomUUID(), first.doc_id, '2026-09-24T09:00:00.000Z', 'NOT_READ', 'we could not reach the service', 0, 0, 0]);
    const p = D.documentPage({ db: w.app.db, audit: w.app.audit, now: w.app.now }, admin(), first.logical_id, 'page', T);
    assert.equal(p.readings.length, 2);
    assert.equal(p.readings[0]?.why, 'we could not reach the service', 'newest first');
    assert.equal(p.readings[1]?.worked, true);
    w.close();
  });
});
