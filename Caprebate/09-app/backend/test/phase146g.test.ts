/**
 * PHASE 146g, 23 September 2026 — THE UPLOAD FLOW RUNS STEPS 9 AND 10 AT LAST, AND SWITCHED OFF IT DOES NOT.
 *
 * `runExtraction` and `writeClaims` were exported by the upload-handler port and called from nowhere in src/: every
 * finished upload stopped at TRIAGED with the strip done and nothing read. Phase 146e built the real reader and left
 * it with no caller. These tests are about the caller.
 *
 * EVERY TEST RUNS ON RECORDED ANSWERS (`fixtureTransport`): no key, no network, and NO REAL CLIENT DOCUMENT — every
 * document here is invented. Where a call has to go out at all, the transfer is approved through the tests-only
 * `policy_override`; the row in src/connectors/sources.ts stays unapproved, and the first test proves that refuses.
 *
 * THE FIRST GROUP IS THE IMPORTANT ONE. Switched off — which is how this ships — a finished upload must behave
 * EXACTLY as it did before this phase: the same row, the same state, the same audit rows, and nothing sent.
 */
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApp } from '../src/server.ts';
import { docxOf } from './document-fixtures.ts';
import { secretsFromValues, emptySecrets, forgetRegisteredSecretsForTest } from '../src/secrets.ts';
import { fixtureTransport, RateLimiter, type Fixture } from '../src/connectors/http.ts';
import { CLAUDE_SWITCHES, type ClaudeSwitches } from '../src/connectors/claude.ts';
import {
  beginUpload, acceptClientBytes, finishUpload, readerFor,
  type ReadingOutcome, type UploadDeps, type UploadReading,
} from '../src/web/uploads.ts';
import { specFor, type DocType } from '../../../04-phase-work/phase3/caprebate-document-pipeline.ts';
import { randomUUID } from 'node:crypto';
import type { Actor } from '../src/authz.ts';
import { outboxTransport } from '../src/stubs/email.ts';
import { recordBounce, isSuppressed } from '../src/stubs/email-provider.ts';
import { stoppedAddresses, liftStoppedAddress } from '../src/web/settings.ts';
import { testApp, actor } from './helpers.ts';
import { smokeOne, smokeSubject, SMOKE_SOURCES, SMOKE_DEFAULTS } from '../src/connectors/smoke.ts';
import { REGISTER_SWITCHES } from '../src/connectors/registers.ts';

const T = '2026-09-23T09:00:00.000Z';
const FAKE_KEY = 'sk-ant-fixture-key-146g-0000-1111';
const MSG = 'POST /v1/messages';
const ON: ClaudeSwitches = { DOCUMENT_READING: true, SCANNED_PAGES: false };
const READING_ON: ClaudeSwitches = { DOCUMENT_READING: true, SCANNED_PAGES: true };
const APPROVED = { international_transfer_approved: true } as const;

afterEach(() => forgetRegisteredSecretsForTest());

/* An invented planning decision notice. The objection is in a section a planning document may NOT send, so the strip
   removes it — and the test below looks for the name in everything that left and in every audit row. */
const OBJECTOR = 'Jonathan Whitmore';
const PLANNING_DOC = [
  'PLANNING DECISION NOTICE',
  'PROPOSAL DESCRIPTION:',
  'Installation of a replacement air handling unit and associated ductwork to the rear elevation.',
  'DECISION:',
  'Application 24/00871/FUL was granted on 14 March 2024.',
  'REPRESENTATIONS RECEIVED:',
  `Mr ${OBJECTOR} of 14 Elm Row objected to the plant noise.`,
];

/** What the model is recorded as answering. Only fields the PLANNING spec asks for. */
const GOOD = {
  fields: [
    { field_id: 'planning_reference', value_json: '"24/00871/FUL"', confidence: 0.96, page: 1, quote_ref: 'DECISION p1' },
    { field_id: 'planning_decision', value_json: '"granted"', confidence: 0.94, page: 1, quote_ref: 'DECISION p1' },
    { field_id: 'planning_decision_date', value_json: '"2024-03-14"', confidence: 0.91, page: 1, quote_ref: 'DECISION p1' },
  ],
};

function answer(content: unknown, extra: Record<string, unknown> = {}): Fixture {
  return {
    status: 200,
    body: JSON.stringify({
      id: 'msg_fixture_146g', type: 'message', role: 'assistant', model: 'claude-opus-5',
      content: [{ type: 'text', text: JSON.stringify(content) }],
      stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 640, output_tokens: 74 }, ...extra,
    }),
  };
}

type World = Awaited<ReturnType<typeof boot>>;

async function boot(): Promise<{
  close(): void;
  app: Awaited<ReturnType<typeof createApp>>['app'];
  store: Awaited<ReturnType<typeof createApp>>['store'];
}> {
  const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-146g-')) });
  made.app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)',
    ['bz', 'X Ltd', 'dental', 'ASSESSMENT_SUBMITTED', T]);
  made.app.db.run(
    'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) '
      + 'VALUES (?,?,?,?,?,?,?,?,?)',
    ['u', 'u@example.test', 'u@example.test', 'U', 'CLIENT', 'x', T, T, 'bz']);
  return { close: made.close, app: made.app, store: made.store };
}

type Opts = {
  fixtures?: Record<string, Fixture | readonly Fixture[]>;
  switches?: ClaudeSwitches;
  keyed?: boolean;
  approved?: boolean;
  /** Omitted altogether — the state before this phase, and the state of any caller that does not wire a reader. */
  noReader?: boolean;
  declared?: DocType;
  lines?: readonly string[];
  discriminants?: UploadReading['discriminants'];
};

/** One upload, end to end, exactly as the two routes run it. */
async function runUpload(w: World, o: Opts = {}): Promise<{
  doc_id: string; state: string; reading: ReadingOutcome; seen: number;
  rows: (kind: string) => { outcome: string; object_id: string | null; detail: string }[];
  everyDetail: () => string;
  records: () => { source_id: string; entity_id: string; fields_json: string }[];
}> {
  const t = fixtureTransport(o.fixtures ?? { [MSG]: answer(GOOD) });
  const reading: UploadReading | undefined = o.noReader === true ? undefined : {
    transport: t,
    secrets: o.keyed === false ? emptySecrets() : secretsFromValues({ ANTHROPIC_API_KEY: FAKE_KEY }),
    switches: o.switches ?? CLAUDE_SWITCHES,
    limiter: new RateLimiter(), sleep: async () => {},
    ...(o.approved === false ? {} : { policy_override: APPROVED }),
    actor_role: 'CLIENT',
    gate: { free_gate_open: false, engagement_signed: true, switched_on: (o.switches ?? CLAUDE_SWITCHES).DOCUMENT_READING },
    ...(o.discriminants === undefined ? {} : { discriminants: o.discriminants }),
  };
  const deps: UploadDeps = {
    db: w.app.db, store: w.store, now: w.app.now, actor: 'u', audit: w.app.audit,
    ...(reading === undefined ? {} : { reading }),
  };
  const b = await beginUpload(deps, {
    business_id: 'bz', uploaded_by: 'u', filename: 'decision.docx', declared_type: o.declared ?? 'PLANNING',
  });
  const token = new URL('http://x' + b.url).searchParams.get('token') ?? '';
  const bytes = new Uint8Array(docxOf(o.lines ?? PLANNING_DOC));
  const written = await acceptClientBytes(deps, { doc_id: b.doc_id, token, bytes });
  assert.equal(written.ok, true, 'the fixture document must be accepted by the sniffer');
  const done = await finishUpload(deps, b.job, written.ok ? written.written_at : T);
  assert.equal(done.error, undefined, 'the upload itself must not fail');
  assert.notEqual(done.reading, undefined, 'finishUpload always reports what steps 9 and 10 did');
  return {
    doc_id: b.doc_id, state: done.job.state, reading: done.reading as ReadingOutcome, seen: t.seen.length,
    rows: (kind) => w.app.db.all<{ outcome: string; object_id: string | null; detail: string }>(
      'SELECT outcome, object_id, detail FROM audit_log WHERE kind = ? ORDER BY seq', [kind]),
    everyDetail: () => w.app.db.all<{ detail: string }>('SELECT detail FROM audit_log').map((r) => r.detail).join('\n'),
    records: () => w.app.db.all<{ source_id: string; entity_id: string; fields_json: string }>(
      'SELECT source_id, entity_id, fields_json FROM register_records ORDER BY rowid'),
  };
}

/* ================================================================== *
 * 1 · OFF, AS SHIPPED — AND THAT MEANS IDENTICAL TO BEFORE THIS PHASE
 * ================================================================== */

describe('switched off, a finished upload behaves exactly as it did before this phase', () => {
  test('G1 — the switch is off in the shipped constant, and it is frozen', () => {
    assert.deepEqual(CLAUDE_SWITCHES, { DOCUMENT_READING: false, SCANNED_PAGES: false });
    assert.equal(Object.isFrozen(CLAUDE_SWITCHES), true);
  });

  test('G2 — with the reader wired and the switch off: TRIAGED, nothing sent, no claim, no reading row', async () => {
    const w = await boot();
    const r = await runUpload(w, {});
    assert.equal(r.reading.state, 'SWITCHED_OFF');
    assert.equal(r.state, 'DISCHARGED', 'the job stops exactly where it stopped before this phase');
    assert.equal(r.seen, 0, 'not one request left the building');
    assert.equal(r.rows('DOCUMENT_READ_BY_MODEL').length, 0);
    assert.equal(r.rows('DOCUMENT_SENT_TO_MODEL').length, 0);
    assert.equal(r.rows('CONNECTOR_CALLED').length, 0);
    assert.deepEqual(r.records(), [], 'nothing entered the register');
    w.close();
  });

  test('G3 — with no reader wired at all, the outcome says so and nothing else differs', async () => {
    const w = await boot();
    const r = await runUpload(w, { noReader: true });
    assert.equal(r.reading.state, 'NOT_WIRED');
    assert.equal(r.state, 'DISCHARGED');
    assert.equal(r.seen, 0);
    assert.deepEqual(r.records(), []);
    w.close();
  });

  test('G4 — switched on with no key: the key is named, nothing is sent, every field stays asked', async () => {
    const w = await boot();
    const r = await runUpload(w, { switches: ON, keyed: false });
    assert.equal(r.reading.state, 'NOT_CONFIGURED');
    assert.match(r.reading.why, /ANTHROPIC_API_KEY/);
    assert.equal(r.seen, 0);
    assert.equal(r.state, 'DISCHARGED');
    assert.deepEqual(r.records(), []);
    w.close();
  });

  test('G5 — switched on and keyed, but the transfer is not approved: http.ts refuses and nothing leaves', async () => {
    const w = await boot();
    const r = await runUpload(w, { switches: ON, approved: false });
    assert.equal(r.reading.state, 'NOT_READ');
    assert.equal(r.seen, 0, 'the refusal happens before the transport is reached');
    assert.equal(r.state, 'TRIAGED', 'step 8 ran, and step 9 did not');
    assert.deepEqual(r.records(), []);
    w.close();
  });
});

/* ================================================================== *
 * 2 · SWITCHED ON — THE TWO STEPS RUN, AND THE STRIP STILL HOLDS
 * ================================================================== */

describe('switched on, the upload runs steps 9 and 10 and the claims enter by the one door', () => {
  test('G6 — the job reaches CLAIMED, and the answered fields are one CLIENT_DOC record keyed on the document', async () => {
    const w = await boot();
    const r = await runUpload(w, { switches: ON });
    assert.equal(r.reading.state, 'CLAIMED', r.reading.why);
    assert.equal(r.state, 'CLAIMED');
    assert.equal(r.seen, 1, 'one call, for one document');
    assert.equal(r.reading.fields, 3);
    assert.equal(r.reading.claims, 3);
    const records = r.records();
    assert.equal(records.length, 1);
    assert.equal(records[0]!.source_id, 'CLIENT_DOC');
    assert.equal(records[0]!.entity_id, r.doc_id, 'the document is the entity, so a second upload is a second record');
    assert.deepEqual(JSON.parse(records[0]!.fields_json), {
      planning_reference: '24/00871/FUL', planning_decision: 'granted', planning_decision_date: '2024-03-14',
    });
    w.close();
  });

  test('G7 — what the spec asked for and the model did not answer is STILL ASKED, never nought and never a guess (N4)', async () => {
    const w = await boot();
    const r = await runUpload(w, { switches: ON });
    const asked = specFor('PLANNING').fields.map((f) => f.field_id);
    assert.equal(r.reading.not_found, asked.length - 3);
    const kept = JSON.parse(r.records()[0]!.fields_json) as Record<string, unknown>;
    for (const f of asked) {
      if (f in kept) continue;
      assert.equal(Object.hasOwn(kept, f), false, `${f} was not answered and must not be in the record at all`);
    }
    assert.equal(Object.values(kept).includes(0), false, 'no unknown became a nought');
    assert.equal(Object.values(kept).includes(null), false, 'and none became a null');
    w.close();
  });

  test('G8 — the objection is in a section this document may not send, so the name is in nothing that left and in no row', async () => {
    const w = await boot();
    const r = await runUpload(w, { switches: ON });
    const sent = r.rows('DOCUMENT_SENT_TO_MODEL');
    assert.equal(sent.length, 1, 'one egress row per document');
    const detail = JSON.parse(sent[0]!.detail) as {
      doc_type: string; payload_hash: string;
      sent: { kind: string; page: number }[]; dropped: { kind: string; reason: string }[];
      fields_requested: string[];
    };
    assert.equal(detail.doc_type, 'PLANNING');
    assert.ok(detail.sent.length > 0 && detail.sent.every((s) => ['PROPOSAL_DESCRIPTION', 'DECISION', 'CONDITIONS'].includes(s.kind)),
      'only the three segment kinds a planning document may send');
    assert.equal(detail.sent.some((x) => x.kind === 'REPRESENTATIONS'), false,
      'the strip removed the representations before this, so there is nothing here to drop and nothing to send');
    assert.deepEqual(detail.fields_requested, specFor('PLANNING').fields.map((f) => f.field_id));
    assert.equal(r.everyDetail().includes(OBJECTOR), false, 'no audit row anywhere carries the objector’s name');
    assert.equal(JSON.stringify(detail).includes('air handling'), false, 'and the egress row carries kinds and pages, never the words');
    w.close();
  });

  test('G9 — one reading row and one call row, and neither carries the key', async () => {
    const w = await boot();
    const r = await runUpload(w, { switches: ON });
    assert.equal(r.rows('DOCUMENT_READ_BY_MODEL').length, 1);
    assert.equal(r.rows('CONNECTOR_CALLED').length, 1);
    assert.equal(r.everyDetail().includes(FAKE_KEY), false);
    w.close();
  });
});

/* ================================================================== *
 * 3 · A READING THAT DOES NOT WORK CHANGES NOTHING — N4
 * ================================================================== */

describe('a reading that fails leaves every field asked, and no screen error', () => {
  const badly = (fixtures: Record<string, Fixture | readonly Fixture[]>, what: string) =>
    test(`G10 — ${what}: the job stays TRIAGED and nothing enters the register`, async () => {
      const w = await boot();
      const r = await runUpload(w, { switches: ON, fixtures });
      assert.equal(r.reading.state, 'NOT_READ', `expected NOT_READ, got ${r.reading.state}: ${r.reading.why}`);
      assert.equal(r.state, 'TRIAGED', 'the transparency record is open and nothing was extracted');
      assert.deepEqual(r.records(), []);
      assert.equal(r.reading.fields, 0);
      w.close();
    });

  badly({ [MSG]: [{ status: 500, body: 'upstream trouble' }, { status: 500, body: 'upstream trouble' },
    { status: 500, body: 'upstream trouble' }] }, 'the service answers 500 every time');
  badly({ [MSG]: { status: 401, body: '{"error":"unauthorised"}' } }, 'the key is refused');

  /* AND THE OTHER HALF OF N4, which is not a failure at all: the call WORKED and nothing usable came back. The
     document is read, the job finishes, and every field is still asked — never a nought and never a guess. */
  const emptily = (fixtures: Record<string, Fixture | readonly Fixture[]>, what: string) =>
    test(`G10a — ${what}: the document is read, nothing is kept, and every field stays asked`, async () => {
      const w = await boot();
      const r = await runUpload(w, { switches: ON, fixtures });
      assert.equal(r.reading.state, 'CLAIMED', r.reading.why);
      assert.equal(r.reading.fields, 0);
      assert.equal(r.reading.claims, 0);
      assert.equal(r.reading.not_found, specFor('PLANNING').fields.length, 'all five are still asked');
      assert.deepEqual(r.records(), [], 'nothing with no field in it is written to the register');
      w.close();
    });

  emptily({ [MSG]: answer('not json at all') }, 'the answer is not in the form asked for');
  emptily({ [MSG]: answer({ fields: [] }) }, 'the answer holds no field at all');

  test('G11 — a field with a confidence outside 0 to 1 is refused BY NAME, and the rest of the document still stands', async () => {
    const w = await boot();
    const r = await runUpload(w, {
      switches: ON,
      fixtures: { [MSG]: answer({ fields: [
        { field_id: 'planning_reference', value_json: '"24/00871/FUL"', confidence: 0.96, page: 1, quote_ref: 'DECISION p1' },
        { field_id: 'planning_decision', value_json: '"granted"', confidence: 4, page: 1, quote_ref: 'DECISION p1' },
        { field_id: 'planning_decision_date', value_json: '"2024-03-14"', confidence: 0.9, page: 1, quote_ref: '' },
        { field_id: 'not_a_planning_field', value_json: '"whatever"', confidence: 0.9, page: 1, quote_ref: 'DECISION p1' },
      ] }) },
    });
    assert.equal(r.reading.state, 'CLAIMED', r.reading.why);
    assert.equal(r.reading.fields, 1, 'only the one good field');
    assert.deepEqual(Object.keys(JSON.parse(r.records()[0]!.fields_json) as object), ['planning_reference']);
    assert.deepEqual((r.reading.read?.refused ?? []).map((x) => x.field_id).sort(),
      ['not_a_planning_field', 'planning_decision', 'planning_decision_date']);
    w.close();
  });
});

/* ================================================================== *
 * 4 · WHAT IS NEVER SENT, WHATEVER THE SWITCH SAYS
 * ================================================================== */

describe('the two kinds of document a person reads are never sent', () => {
  for (const t of ['CPSE_REPLIES', 'SALE_CONTRACT'] as const) {
    test(`G12 — ${t} has no model spec, so it is refused a step before runExtraction would refuse it`, async () => {
      const w = await boot();
      const r = await runUpload(w, {
        switches: ON, declared: t,
        lines: ['PARTIES:', 'The seller is X Ltd and the buyer is Y Ltd.', 'REPLIES TO ENQUIRIES:', 'None given.'],
      });
      assert.equal(r.reading.state, 'HUMAN_ONLY');
      assert.equal(r.seen, 0);
      assert.equal(r.state, 'TRIAGED', 'step 8 runs for it — the record of what we hold is not about who reads it');
      assert.deepEqual(r.records(), []);
      w.close();
    });
  }
});

/* ================================================================== *
 * 5 · THE PAGE READER IS DERIVED ONLY WHILE ITS OWN SWITCH IS ON
 * ================================================================== */

describe('a scanned document’s pages are read only while SCANNED_PAGES is on', () => {
  /* A PDF with no text operators at all is what `extract-text.ts` returns its marker for. Here the document is a
     .docx, so nothing scans; what these two prove is the WIRING — that the reader is built from `reading` only when
     the second switch is on, and that the first switch alone does not build it. */
  test('G13 — DOCUMENT_READING on and SCANNED_PAGES off: no call is made for pages, only for fields', async () => {
    const w = await boot();
    const r = await runUpload(w, { switches: ON });
    assert.equal(r.rows('DOCUMENT_PAGES_READ_BY_MODEL').length, 0);
    assert.equal(r.seen, 1);
    w.close();
  });

  test('G14 — both on: still one call for this document, because it is not a scan', async () => {
    const w = await boot();
    const r = await runUpload(w, { switches: READING_ON });
    assert.equal(r.rows('DOCUMENT_PAGES_READ_BY_MODEL').length, 0, 'a .docx never reaches the page reader');
    assert.equal(r.reading.state, 'CLAIMED', r.reading.why);
    w.close();
  });
});

/* ================================================================== *
 * 6 · THE ONE PLACE A ROUTE BUILDS A READER
 * ================================================================== */

describe('readerFor is the only thing a route builds, and it opens nothing', () => {
  test('G15 — it carries the process’s own key store and transport, and reports the gates as they stand', async () => {
    const w = await boot();
    const r = readerFor(w.app, 'bz', 'CLIENT');
    assert.equal(r.secrets, w.app.secrets);
    assert.equal(r.transport, w.app.outside);
    assert.equal(r.switches, undefined, 'it does not carry its own switches: CLAUDE_SWITCHES is read where it is used');
    assert.deepEqual(r.gate, { free_gate_open: false, engagement_signed: false, switched_on: false },
      'the free gate is shut, this client has signed nothing, and reading is off');
    w.close();
  });
});

/* ================================================================== *
 * 7 · ADDRESSES WE CANNOT EMAIL — the screen `liftSuppression` never had
 *
 * Phase 146f stopped sending to an address that bounced for good and wrote `liftSuppression` for a member of staff
 * to say it works again. Nothing called it, so an address stopped for good was stopped for ever.
 * ================================================================== */

describe('an address stopped by a bounce can be lifted, by an administrator, as a new row', () => {
  async function withOutbox(): Promise<{ app: Awaited<ReturnType<typeof testApp>>; admin: Actor; sales: Actor }> {
    const app = await testApp();
    app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)',
      ['bz', 'X Ltd', 'dental', 'ASSESSMENT_SUBMITTED', T]);
    for (const [id, role] of [['u-ADMIN', 'ADMIN'], ['u-SALES', 'SALES']] as const) {
      app.db.run(
        'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at) '
          + 'VALUES (?,?,?,?,?,?,?,?)',
        [id, `${id}@example.test`, `${id}@example.test`, id, role, 'x', T, T]);
    }
    return { app, admin: actor('ADMIN'), sales: actor('SALES') };
  }

  /** One email that bounced for good, and the address it was sent to. */
  function bounced(app: Awaited<ReturnType<typeof testApp>>, to: string, subject: string): void {
    const send = outboxTransport(app.db, randomUUID, app.now, () => true);
    const m = send.send({ to_email: to, subject, body: 'Words.', kind: 'NOTIFICATION', business_id: 'bz' });
    assert.notEqual(m.id, null, 'the fixture email must reach the outbox');
    recordBounce(app.db, app.now, m.id as string, { kind: 'HARD', status: '5.1.1', source: 'SMTP' });
  }

  test('G16 — a stopped address is listed with the code and the email that bounced, and never the server’s words', async () => {
    const { app, admin } = await withOutbox();
    bounced(app, 'Gone@Example.org', 'Your estimate');
    const rows = stoppedAddresses(app.db, admin);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.address, 'gone@example.org', 'the address is kept as the canonical one that was refused');
    assert.equal(rows[0]!.status, '5.1.1');
    assert.equal(rows[0]!.subject, 'Your estimate');
    app.close();
  });

  test('G17 — a SOFT bounce does not stop an address, so it is not on the screen', async () => {
    const { app, admin } = await withOutbox();
    const send = outboxTransport(app.db, randomUUID, app.now, () => true);
    const m = send.send({ to_email: 'full@example.org', subject: 'One', body: 'x', kind: 'NOTIFICATION', business_id: 'bz' });
    recordBounce(app.db, app.now, m.id as string, { kind: 'SOFT', status: '4.2.2', source: 'SMTP' });
    assert.deepEqual(stoppedAddresses(app.db, admin), []);
    app.close();
  });

  test('G18 — the lift is a NEW ROW: the bounce and the stop both stay, and the address can be emailed again', async () => {
    const { app, admin } = await withOutbox();
    bounced(app, 'gone@example.org', 'Your estimate');
    assert.equal(isSuppressed(app.db, 'gone@example.org'), true);
    const r = liftStoppedAddress({ db: app.db, audit: app.audit, now: app.now }, admin, 'gone@example.org');
    assert.equal(r.lifted, true);
    assert.equal(isSuppressed(app.db, 'gone@example.org'), false);
    assert.deepEqual(stoppedAddresses(app.db, admin), []);
    assert.equal(app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM email_bounces')?.n, 1, 'the bounce is still on record');
    assert.equal(app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM email_suppressions')?.n, 2, 'the stop and the lift, both rows');
    const lift = app.db.get<{ state: string; set_by: string | null; bounce_id: string | null }>(
      'SELECT state, set_by, bounce_id FROM email_suppressions ORDER BY at DESC, rowid DESC LIMIT 1');
    assert.deepEqual({ ...lift }, { state: 'LIFTED', set_by: 'u-ADMIN', bounce_id: null });
    app.close();
  });

  test('G19 — lifting an address that was not stopped changes nothing, and is not an error', async () => {
    const { app, admin } = await withOutbox();
    const r = liftStoppedAddress({ db: app.db, audit: app.audit, now: app.now }, admin, 'nobody@example.org');
    assert.equal(r.lifted, false);
    assert.equal(app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM email_suppressions')?.n, 0);
    app.close();
  });

  test('G20 — one audit row either way, and it carries no address', async () => {
    const { app, admin } = await withOutbox();
    bounced(app, 'gone@example.org', 'Your estimate');
    liftStoppedAddress({ db: app.db, audit: app.audit, now: app.now }, admin, 'gone@example.org');
    liftStoppedAddress({ db: app.db, audit: app.audit, now: app.now }, admin, 'gone@example.org');
    const rows = app.audit.entries().filter((e) => e.kind === 'EMAIL_ADDRESS_LIFTED');
    assert.deepEqual(rows.map((e) => e.outcome), ['ALLOWED', 'REFUSED']);
    assert.equal(JSON.stringify(rows).includes('gone@example.org'), false, 'no log line carries an address');
    app.close();
  });

  test('G21 — it is ADMIN’s. Sales can neither read the list nor lift an address', async () => {
    const { app, admin, sales } = await withOutbox();
    bounced(app, 'gone@example.org', 'Your estimate');
    assert.throws(() => stoppedAddresses(app.db, sales));
    assert.throws(() => liftStoppedAddress({ db: app.db, audit: app.audit, now: app.now }, sales, 'gone@example.org'));
    assert.equal(isSuppressed(app.db, 'gone@example.org'), true, 'and it is still stopped');
    assert.equal(stoppedAddresses(app.db, admin).length, 1);
    app.close();
  });
});

/* ================================================================== *
 * 8 · THE LIVE SMOKE TEST — PHASE 146g
 *
 * The handover page gives every outside service a row, and one column of it is "the live smoke test that proves it".
 * There was no such thing: every suite runs on recorded answers with no key and no network, which proves the code
 * and proves nothing about an account somebody has just opened. These tests are of the smoke test, on fixtures.
 * ================================================================== */

describe('the live smoke test says whether a service took our call, and nothing else', () => {
  const values = { ...SMOKE_DEFAULTS };
  async function smoke(source_id: string, fixtures: Record<string, Fixture | readonly Fixture[]>, keyed = true) {
    const app = await testApp();
    const t = fixtureTransport(fixtures);
    const r = await smokeOne(source_id, values, {
      audit: app.audit, now: app.now, transport: t,
      secrets: keyed ? secretsFromValues({ COMPANIES_HOUSE_API_KEY: 'ch-fixture-key' }) : emptySecrets(),
      sleep: async () => {},
    });
    return { r, t, app };
  }

  test('G22 — every source with a connector is on the list, and nothing else is', () => {
    assert.deepEqual(Object.keys(SMOKE_SOURCES).sort(),
      ['CH_COMPANY', 'CH_PSC', 'CQC', 'EPC', 'HMLR_PPD', 'HMLR_TITLE', 'HOMEDATA_ADDRESS', 'HOMEDATA_PLANNING', 'ONS_POSTCODE', 'PLANNING']);
    assert.equal(SMOKE_SOURCES['HOMEDATA_PLANNING'], 'not chosen', 'built and not chosen is still smoke-testable');
  });

  test('G23 — the values it asks about are public and belong to nobody we act for', () => {
    assert.deepEqual({ ...SMOKE_DEFAULTS },
      { company_number: '17307313', company_name: 'CAP REBATE LTD', address_line_1: '70 Whitehall', town: 'London', postcode: 'SW1A 2AS' });
    const s = smokeSubject(values);
    assert.equal(s.property?.jurisdiction, null, 'which part of the UK it is in is never assumed');
    assert.match(s.business_id, /smoke test/, 'and there is no client behind it');
  });

  test('G24 — the service answers: PASS, and the shipped switches are not touched', async () => {
    const before = JSON.stringify(REGISTER_SWITCHES);
    const { r, app } = await smoke('CH_COMPANY', {
      'GET /company/17307313': { status: 200, body: JSON.stringify({
        company_number: '17307313', company_name: 'CAP REBATE LTD', type: 'ltd', company_status: 'active',
        date_of_creation: '2025-01-01', registered_office_address: { postal_code: 'SW1A 2AS' },
      }) },
      'GET /company/17307313/filing-history': { status: 200, body: JSON.stringify({ items: [] }) },
    });
    assert.equal(r.accepted, true, r.why);
    assert.equal(r.tier, 'free');
    assert.equal(r.call?.status, 200);
    assert.equal(JSON.stringify(REGISTER_SWITCHES), before, 'REGISTER_SWITCHES is exactly as it ships');
    assert.equal(REGISTER_SWITCHES['CH_COMPANY'], false);
    app.close();
  });

  test('G25 — the key is refused: NO, and it says so without printing the key', async () => {
    const { r, app } = await smoke('CH_COMPANY', { 'GET /company/17307313': { status: 401, body: '{"error":"Invalid Authorization"}' } });
    assert.equal(r.accepted, false);
    assert.equal(r.call?.status, 401);
    assert.equal(JSON.stringify(r).includes('ch-fixture-key'), false);
    app.close();
  });

  test('G26 — the register holds nothing: still a PASS, because the account plainly works', async () => {
    const { r, app } = await smoke('CH_COMPANY', {
      'GET /company/17307313': { status: 404, body: '{"errors":[{"type":"ch:service","error":"company-profile-not-found"}]}' },
      'GET /search/companies': { status: 200, body: JSON.stringify({ items: [] }) },
    });
    assert.equal(r.accepted, true, r.why);
    app.close();
  });

  test('G27 — no key at all: NO, and no call was made, because nothing was proved', async () => {
    const { r, t, app } = await smoke('CH_COMPANY', {}, false);
    assert.equal(r.accepted, false);
    assert.equal(r.call, null);
    assert.equal(t.seen.length, 0);
    assert.match(r.outcome, /NOT_RUN/);
    app.close();
  });

  test('G28 — a source with no connector is refused by name, and nothing is contacted', async () => {
    const app = await testApp();
    const t = fixtureTransport({});
    const r = await smokeOne('BCIS', values, { audit: app.audit, now: app.now, transport: t, secrets: emptySecrets() });
    assert.equal(r.accepted, false);
    assert.equal(r.outcome, 'NO_CONNECTOR');
    assert.equal(t.seen.length, 0);
    app.close();
  });

  test('G29 — the audit row is written for the smoke call too, and it reports both gates shut', async () => {
    const { r, app } = await smoke('CH_COMPANY', {
      'GET /company/17307313': { status: 200, body: JSON.stringify({ company_number: '17307313', company_name: 'CAP REBATE LTD', type: 'ltd', company_status: 'active' }) },
      'GET /company/17307313/filing-history': { status: 200, body: JSON.stringify({ items: [] }) },
    });
    assert.equal(r.accepted, true);
    const rows = app.audit.entries().filter((e) => e.kind === 'CONNECTOR_CALLED');
    assert.ok(rows.length >= 1);
    const detail = rows[0]?.detail as { free_gate_open?: boolean; engagement_signed?: boolean; switched_on?: boolean } | undefined;
    assert.deepEqual([detail?.free_gate_open, detail?.engagement_signed, detail?.switched_on], [false, false, true],
      'neither gate is open, and the source was switched on for this one command');
    app.close();
  });
});
