/**
 * PHASE 146e, 22 September 2026 — CLIENT DOCUMENTS READ BY THE CLAUDE API, BUILT AND SWITCHED OFF.
 *
 * The real ModelFn (src/connectors/claude.ts) on the Anthropic SDK, its calls going through the one way out, and the
 * vision path for scanned PDFs. EVERY TEST RUNS ON RECORDED ANSWERS (`fixtureTransport`) shaped from the Messages
 * API's published response: no key, no network, and no real client document — every document here is invented.
 * Where a test needs a call to go out at all, it approves the transfer through the tests-only `policy_override`;
 * the row in src/connectors/sources.ts stays unapproved, and the first tests prove that refuses every call.
 */
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { secretsFromValues, emptySecrets, forgetRegisteredSecretsForTest } from '../src/secrets.ts';
import { fixtureTransport, fetchThroughCallOutside, RateLimiter, OutsideCallFailed, type CallDeps, type GateSnapshot, type Fixture } from '../src/connectors/http.ts';
import { CALL_POLICIES } from '../src/connectors/sources.ts';
import * as CL from '../src/connectors/claude.ts';
import {
  extractPages, isMarkerPages, isScanMarker, pdfPageImages, UNREADABLE_MARKER_PREFIX,
} from '../src/web/extract-text.ts';
import { documentTextExtractor } from '../src/web/uploads.ts';
import {
  extract, sanitise, PERSON_REVIEW_BY_DOC_TYPE, specFor, type ModelPayload, type Segment,
} from '../../../04-phase-work/phase3/caprebate-document-pipeline.ts';
import { testApp } from './helpers.ts';

const FAKE_KEY = 'sk-ant-fixture-key-4444-5555-6666';
const ON: CL.ClaudeSwitches = { DOCUMENT_READING: true, SCANNED_PAGES: true };
const GATE: GateSnapshot = { free_gate_open: false, engagement_signed: true, switched_on: true };
const APPROVED = { international_transfer_approved: true } as const;

afterEach(() => forgetRegisteredSecretsForTest());

async function world(fixtures: Record<string, Fixture | readonly Fixture[]>, opts: {
  approved?: boolean; switches?: CL.ClaudeSwitches; keyed?: boolean; more?: Partial<CallDeps>;
} = {}) {
  const app = await testApp();
  const t = fixtureTransport(fixtures);
  const deps: CallDeps = {
    audit: app.audit, now: app.now, transport: t, limiter: new RateLimiter(), sleep: async () => {},
    ...(opts.approved === false ? {} : { policy_override: APPROVED }), ...opts.more,
  };
  const ctx: CL.ClaudeContext = {
    deps, secrets: opts.keyed === false ? emptySecrets() : secretsFromValues({ ANTHROPIC_API_KEY: FAKE_KEY }),
    switches: opts.switches ?? ON, actor_id: 'u-ADMIN', actor_role: 'ADMIN', claim_id: 'claim-146e', gate: GATE,
  };
  const rows = (kind: string) => app.db.all<{ outcome: string; object_id: string | null; detail: string }>(
    'SELECT outcome, object_id, detail FROM audit_log WHERE kind = ? ORDER BY seq', [kind]);
  const everyRow = () => app.db.all<{ detail: string }>('SELECT detail FROM audit_log').map((r) => r.detail).join('\n');
  return { app, t, ctx, rows, everyRow };
}

/** A Messages API answer, shaped from the published response object. */
function answer(content: unknown, extra: Record<string, unknown> = {}): Fixture {
  return {
    status: 200,
    body: JSON.stringify({
      id: 'msg_fixture_01', type: 'message', role: 'assistant', model: 'claude-opus-5',
      content: [{ type: 'text', text: typeof content === 'string' ? content : JSON.stringify(content) }],
      stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 812, output_tokens: 96 }, ...extra,
    }),
  };
}

/* An invented fire risk assessment, after the receipt strip. The forbidden and unpermitted sections carry words a
   test looks for in what was sent. */
const FINDINGS_TEXT = 'Alarm system: Category L1 throughout. Emergency lighting fitted to all escape routes.';
const OBJECTION_TEXT = 'Letter received objecting to the extension from the neighbour at number 4';
const SIGNED_TEXT = 'Assessment carried out by the assessor named on the cover';
const MEDICAL_TEXT = 'Room 12 resident uses a wheelchair and needs two staff to evacuate';
const SEGS: Segment[] = [
  { kind: 'FINDINGS', heading: 'SIGNIFICANT FINDINGS', text: FINDINGS_TEXT, page: 2 },
  { kind: 'REPRESENTATIONS', heading: 'REPRESENTATIONS', text: OBJECTION_TEXT, page: 3 },
  { kind: 'SIGNATORIES', heading: 'ASSESSOR DETAILS', text: SIGNED_TEXT, page: 5 },
  { kind: 'UNCLASSIFIED', heading: '(no heading)', text: MEDICAL_TEXT, page: 4 },
  { kind: 'COST_SCHEDULE', heading: 'COST SCHEDULE', text: 'Not a section a fire risk assessment may send', page: 6 },
];
const GOOD = {
  fields: [
    { field_id: 'fra_alarm_system_category', value_json: '"L1"', confidence: 0.97, page: 2, quote_ref: 'SIGNIFICANT FINDINGS p2' },
    { field_id: 'fra_emergency_lighting', value_json: '"fitted to all escape routes"', confidence: 0.9, page: 2, quote_ref: 'SIGNIFICANT FINDINGS p2' },
  ],
};
const MSG = 'POST /v1/messages';
const AT = '2026-09-22T12:00:00.000Z';
const FRA_FIELDS = specFor('FIRE_RISK_ASSESSMENT').fields.map((f) => f.field_id);

async function readFra(ctx: CL.ClaudeContext) {
  const { model, read } = await CL.prepareClaudeModel(ctx, 'doc-146e', 'FIRE_RISK_ASSESSMENT', SEGS);
  const egress: Parameters<typeof extract>[4]['egress'] = [];
  const result = extract('doc-146e', 'FIRE_RISK_ASSESSMENT', SEGS, model, { at: AT, egress });
  return { read, result, egress };
}

/* ================================================================== *
 * 1 · OFF, AS SHIPPED
 * ================================================================== */

describe('as shipped, nothing is sent and every field stays asked', () => {
  test('BOTH SWITCHES ARE OFF, and the Claude API row still refuses a transfer outside the UK and EU', () => {
    assert.deepEqual(CL.CLAUDE_SWITCHES, { DOCUMENT_READING: false, SCANNED_PAGES: false });
    assert.equal(Object.isFrozen(CL.CLAUDE_SWITCHES), true);
    const row = CALL_POLICIES.CLAUDE_DOCUMENTS!;
    assert.deepEqual([row.region, row.international_transfer_approved, row.base_url], ['US', false, 'https://api.anthropic.com']);
    assert.equal(CL.CLAUDE_MODEL, 'claude-opus-5');
  });

  test('switched off: no call, one reading row saying so, and every field ASKED', async () => {
    const w = await world({ [MSG]: answer(GOOD) }, { switches: CL.CLAUDE_SWITCHES });
    const { read, result } = await readFra(w.ctx);
    assert.equal(read.state, 'SWITCHED_OFF');
    assert.equal(w.t.seen.length, 0);
    assert.equal(w.rows('CONNECTOR_CALLED').length, 0);
    assert.equal(w.rows('DOCUMENT_READ_BY_MODEL').length, 1);
    assert.deepEqual(result.fields, []);
    assert.deepEqual(result.not_found.sort(), [...FRA_FIELDS].sort());
    w.app.close();
  });

  test('switched on with no key: NOT_CONFIGURED names the key, and nothing is sent', async () => {
    const w = await world({ [MSG]: answer(GOOD) }, { keyed: false });
    const { read, result } = await readFra(w.ctx);
    assert.equal(read.state, 'NOT_CONFIGURED');
    assert.match(read.why, /ANTHROPIC_API_KEY/);
    assert.equal(w.t.seen.length, 0);
    assert.equal(result.fields.length, 0);
    w.app.close();
  });

  test('switched on and keyed, but the transfer is not approved: http.ts refuses, nothing leaves, the fields stay asked', async () => {
    const w = await world({ [MSG]: answer(GOOD) }, { approved: false });
    const { read, result } = await readFra(w.ctx);
    assert.equal(read.state, 'FAILED');
    assert.match(read.why, /outside the UK and EU/);
    assert.equal(w.t.seen.length, 0, 'a call left the building with the transfer unapproved');
    const call = w.rows('CONNECTOR_CALLED');
    assert.equal(call.length, 1);
    assert.equal(call[0]!.outcome, 'REFUSED');
    assert.deepEqual(result.not_found.sort(), [...FRA_FIELDS].sort());
    w.app.close();
  });
});

/* ================================================================== *
 * 2 · A READING, AND WHAT IT SENDS
 * ================================================================== */

describe('a reading goes through the one way out, sends only what the strip passed, and is written down without its text', () => {
  test('one call per permitted segment set: the model, structured output, the fallback, the key in its header', async () => {
    const w = await world({ [MSG]: answer(GOOD) });
    const { read } = await readFra(w.ctx);
    assert.equal(read.state, 'READ');
    assert.equal(w.t.seen.length, 1, 'not exactly one call');
    const sent = w.t.seen[0]!;
    assert.equal(sent.url.startsWith('https://api.anthropic.com/v1/messages'), true);
    assert.equal(sent.headers['x-api-key'], FAKE_KEY);
    assert.match(sent.headers['anthropic-beta'] ?? '', /server-side-fallback-2026-07-01/);
    const body = JSON.parse(sent.body ?? '{}') as Record<string, any>;
    assert.equal(body.model, 'claude-opus-5');
    assert.equal(body.fallbacks, 'default');
    assert.equal(body.output_config.format.type, 'json_schema');
    assert.deepEqual(body.output_config.format.schema.properties.fields.items.properties.field_id.enum, FRA_FIELDS);
    assert.equal(body.thinking, undefined, 'thinking is left to the model default (adaptive on Claude Opus 5)');
    w.app.close();
  });

  test('A WITHHELD SEGMENT NEVER REACHES THE MODEL — forbidden kinds, unclassified text and unpermitted sections alike', async () => {
    const w = await world({ [MSG]: answer(GOOD) });
    await readFra(w.ctx);
    const body = w.t.seen[0]!.body ?? '';
    assert.ok(body.includes('Category L1 throughout'), 'the permitted findings were not sent');
    for (const withheld of [OBJECTION_TEXT, SIGNED_TEXT, MEDICAL_TEXT, 'Not a section a fire risk assessment may send']) {
      assert.equal(body.includes(withheld), false, `withheld text reached the model: ${withheld}`);
    }
    w.app.close();
  });

  test('a payload with nothing permitted left is not sent at all', async () => {
    const w = await world({ [MSG]: answer(GOOD) });
    const onlyForbidden = SEGS.filter((s) => s.kind !== 'FINDINGS');
    const { read } = await CL.prepareClaudeModel(w.ctx, 'doc-empty', 'FIRE_RISK_ASSESSMENT', onlyForbidden);
    assert.equal(read.state, 'NOTHING_TO_SEND');
    assert.equal(w.t.seen.length, 0);
    w.app.close();
  });

  test('THE PAYLOAD GUARD STILL REFUSES what the strip did not pass — a forbidden segment and a name — before the network', async () => {
    const w = await world({ [MSG]: answer(GOOD) });
    const { payload } = sanitise('doc-g', 'FIRE_RISK_ASSESSMENT', SEGS);
    const forged = { ...payload, segments: [...payload.segments, { kind: 'CORRESPONDENCE', heading: 'LETTER', text: 'x', page: 9 }] } as unknown as ModelPayload;
    await assert.rejects(CL.readPayloadWithClaude(w.ctx, forged), /E_FORBIDDEN_SEGMENT/);
    const named = { ...payload, segments: [{ kind: 'FINDINGS', heading: 'FINDINGS', text: 'Checked by Mr Smith', page: 2 }] } as unknown as ModelPayload;
    await assert.rejects(CL.readPayloadWithClaude(w.ctx, named), /E_PERSON_NAME/);
    assert.equal(w.t.seen.length, 0, 'a refused payload reached the network');
    w.app.close();
  });

  test('ONE AUDIT ROW PER CALL: document type, segment ids, model, token counts — and never the text or the key', async () => {
    const w = await world({ [MSG]: answer(GOOD) });
    await readFra(w.ctx);
    assert.equal(w.rows('CONNECTOR_CALLED').length, 1);
    const rows = w.rows('DOCUMENT_READ_BY_MODEL');
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.object_id, 'doc-146e');
    const d = JSON.parse(rows[0]!.detail) as Record<string, any>;
    assert.equal(d.doc_type, 'FIRE_RISK_ASSESSMENT');
    assert.deepEqual(d.segments, ['0:FINDINGS:p2']);
    assert.equal(d.model, 'claude-opus-5');
    assert.equal(d.requested_model, 'claude-opus-5');
    assert.deepEqual(d.usage, { input: 812, output: 96 });
    assert.equal(d.fields_returned, 2);
    const all = w.everyRow();
    for (const words of ['Category L1', 'escape routes', 'SIGNIFICANT FINDINGS', OBJECTION_TEXT, FAKE_KEY]) {
      assert.equal(all.includes(words), false, `the audit chain holds "${words}"`);
    }
    w.app.close();
  });

  test('the answer becomes the extraction, and FIRE RISK ASSESSMENTS ARE CHECKED BY A PERSON on every field', async () => {
    const w = await world({ [MSG]: answer(GOOD) });
    const { result, egress } = await readFra(w.ctx);
    assert.deepEqual(result.fields.map((f) => [f.field_id, f.value]), [
      ['fra_alarm_system_category', 'L1'], ['fra_emergency_lighting', 'fitted to all escape routes'],
    ]);
    assert.ok(result.fields.every((f) => f.needs_human_review), 'a fire risk assessment field stood with no person checking it');
    assert.equal(result.review.length, 2);
    assert.equal(egress.length, 1, 'extract() wrote its egress entry once');
    assert.deepEqual(egress[0]!.segments_sent, [{ kind: 'FINDINGS', page: 2 }]);
    assert.equal(PERSON_REVIEW_BY_DOC_TYPE.LEASE, false, 'another type was switched on');
    w.app.close();
  });

  test('the ModelFn answers only the payload it was prepared for', async () => {
    const w = await world({ [MSG]: answer(GOOD) });
    const { model } = await CL.prepareClaudeModel(w.ctx, 'doc-146e', 'FIRE_RISK_ASSESSMENT', SEGS);
    const other = SEGS.map((s) => (s.kind === 'FINDINGS' ? { ...s, text: 'Alarm system: Category L2.' } : s));
    assert.throws(() => extract('doc-146e', 'FIRE_RISK_ASSESSMENT', other, model, { at: AT, egress: [] }), /E_PAYLOAD_CHANGED/);
    w.app.close();
  });
});

/* ================================================================== *
 * 3 · N4 — A MODEL FAILURE LEAVES THE FIELD ASKED
 * ================================================================== */

describe('when the reading does not work, every field stays asked — never a zero, never a guess, never a throw', () => {
  const cases: [string, Record<string, Fixture | readonly Fixture[]>, Partial<CallDeps>?][] = [
    ['a 500 on every try', { [MSG]: { status: 500, body: '{"type":"error","error":{"type":"api_error","message":"x"}}' } }],
    ['a 400', { [MSG]: { status: 400, body: '{"type":"error","error":{"type":"invalid_request_error","message":"x"}}' } }],
    ['a time-out', { [MSG]: { status: 200, body: '{}', delay_ms: 200 } }, { policy_override: { ...APPROVED, timeout_ms: 20 } }],
    ['a broken connection', { [MSG]: { status: 200, body: '{}', network_error: true } }],
    ['an answer too large', { [MSG]: answer(GOOD) }, { policy_override: { ...APPROVED, max_bytes: 50 } }],
    ['a refusal', { [MSG]: answer('', { stop_reason: 'refusal' }) }],
    ['an answer cut off', { [MSG]: answer('{"fields":[{"field_id":"fra_', { stop_reason: 'max_tokens' }) }],
    ['an answer not in the form asked for', { [MSG]: answer({ something: 'else' }) }],
  ];
  for (const [what, fixtures, more] of cases) {
    test(`${what}: FAILED or empty, and every field ASKED`, async () => {
      const w = await world(fixtures, more === undefined ? {} : { more });
      const { read, result } = await readFra(w.ctx);
      assert.notEqual(read.fields_returned > 0, true);
      assert.deepEqual(result.fields, [], 'a field was given a value when the reading failed');
      assert.deepEqual(result.not_found.sort(), [...FRA_FIELDS].sort());
      assert.equal(w.rows('DOCUMENT_READ_BY_MODEL').length, 1);
      w.app.close();
    });
  }

  test('a field the answer should not have given is refused, not mended, and stays asked', async () => {
    const w = await world({
      [MSG]: answer({
        fields: [
          { field_id: 'fra_alarm_system_category', value_json: '"L1"', confidence: 1.5, page: 2, quote_ref: 'p2' },
          { field_id: 'fra_emergency_lighting', value_json: '"yes"', confidence: 0.9, page: 7, quote_ref: 'p7' },
          { field_id: 'fra_dry_or_wet_riser', value_json: '"dry"', confidence: 0.9, page: 2, quote_ref: '' },
          { field_id: 'fra_fire_door_count', value_json: 'forty', confidence: 0.9, page: 2, quote_ref: 'p2' },
          { field_id: 'fra_assessment_date', value_json: '"Checked by Mr Smith"', confidence: 0.9, page: 2, quote_ref: 'p2' },
          { field_id: 'fra_sprinkler_or_suppression', value_json: 'null', confidence: 0.9, page: 2, quote_ref: 'p2' },
          { field_id: 'fra_smoke_ventilation_aov', value_json: '"AOV at stair head"', confidence: 0.8, page: 2, quote_ref: 'SIGNIFICANT FINDINGS p2' },
        ],
      }),
    });
    const { read, result } = await readFra(w.ctx);
    assert.deepEqual(result.fields.map((f) => f.field_id), ['fra_smoke_ventilation_aov']);
    assert.deepEqual(read.refused.map((r) => r.field_id).sort(),
      ['fra_alarm_system_category', 'fra_assessment_date', 'fra_dry_or_wet_riser', 'fra_emergency_lighting', 'fra_fire_door_count']);
    assert.equal(w.everyRow().includes('Smith'), false);
    w.app.close();
  });
});

/* ================================================================== *
 * 4 · THE ADAPTER
 * ================================================================== */

describe('the SDK is given no way out but callOutside', () => {
  test('a path the library may not use is refused and written down; an answer goes back as a Response', async () => {
    const w = await world({ [MSG]: answer(GOOD) });
    const f = fetchThroughCallOutside(w.ctx.deps, { service_id: 'CLAUDE_DOCUMENTS', endpoints: ['/v1/messages'], actor_id: null, claim_id: null, gate: GATE });
    await assert.rejects(f('https://api.anthropic.com/v1/files', { method: 'GET' }), OutsideCallFailed);
    await assert.rejects(f('https://evil.example/v1/messages', { method: 'DELETE' }), OutsideCallFailed);
    const ok = await f('https://somewhere-else.example/v1/messages?beta=true', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
    assert.equal(ok.status, 200);
    assert.equal(w.t.seen.length, 1);
    assert.equal(w.t.seen[0]!.url.startsWith('https://api.anthropic.com/v1/messages'), true, 'the host the library asked for was used');
    assert.equal(w.rows('CONNECTOR_CALLED').length, 3);
    w.app.close();
  });
});

/* ================================================================== *
 * 5 · SCANNED PDFS
 * ================================================================== */

/** An invented one-page scan: a JPEG picture and a content stream that only draws it. No text operators. */
function scannedPdf(opts: { encrypted?: boolean; filter?: string } = {}): Buffer {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('invented-page-picture'), Buffer.from([0xff, 0xd9])]);
  const draw = 'q 612 0 0 792 0 0 cm /Im0 Do Q';
  const parts = [
    Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R /MediaBox [0 0 612 792] >>\nendobj\n' +
      `4 0 obj\n<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /${opts.filter ?? 'DCTDecode'} /Length ${jpeg.length} >>\nstream\n`, 'latin1'),
    jpeg,
    Buffer.from(`\nendstream\nendobj\n5 0 obj\n<< /Length ${draw.length} >>\nstream\n${draw}\nendstream\nendobj\n` +
      `trailer\n<< /Root 1 0 R${opts.encrypted === true ? ' /Encrypt 6 0 R' : ''} >>\n%%EOF\n`, 'latin1'),
  ];
  return Buffer.concat(parts);
}
const PAGE_TEXT = { pages: [{ page: 1, lines: ['SIGNIFICANT FINDINGS', 'Alarm system: Category L1 throughout.'] }] };

describe('a scanned PDF: its pictures read as text behind their own switch, and the marker kept for everything else', () => {
  test('the scan marker, and the page picture lifted out as it is', () => {
    const pdf = scannedPdf();
    assert.equal(isScanMarker(extractPages(pdf)), true);
    const images = pdfPageImages(pdf)!;
    assert.equal(images.length, 1);
    assert.deepEqual([images[0]!.page, images[0]!.media_type, images[0]!.data[0], images[0]!.data[1]], [1, 'image/jpeg', 0xff, 0xd8]);
    assert.equal(pdfPageImages(scannedPdf({ encrypted: true })), null, 'a picture was lifted from an encrypted PDF');
    assert.equal(pdfPageImages(scannedPdf({ filter: 'JBIG2Decode' })), null, 'a picture that is not a JPEG was lifted');
  });

  test('switched on: the pages come back as text, and that text goes to the same strip as any other', async () => {
    const w = await world({ [MSG]: answer(PAGE_TEXT) });
    const ex = documentTextExtractor(async (images) => (await CL.readScannedPages(w.ctx, 'doc-scan', images)).pages);
    const pages = await ex.toPages(scannedPdf());
    assert.deepEqual(pages, [{ page: 1, lines: ['SIGNIFICANT FINDINGS', 'Alarm system: Category L1 throughout.'] }]);
    const body = JSON.parse(w.t.seen[0]!.body ?? '{}') as Record<string, any>;
    const image = body.messages[0].content.find((c: { type: string }) => c.type === 'image');
    assert.equal(image.source.media_type, 'image/jpeg');
    const rows = w.rows('DOCUMENT_PAGES_READ_BY_MODEL');
    assert.equal(rows.length, 1);
    assert.equal(w.everyRow().includes('Category L1'), false, 'the words read off a page reached the audit chain');
    w.app.close();
  });

  test('SWITCHED OFF ON ITS OWN: with document reading on and scanned pages off, a scan keeps its marker and nothing is sent', async () => {
    const w = await world({ [MSG]: answer(PAGE_TEXT) }, { switches: { DOCUMENT_READING: true, SCANNED_PAGES: false } });
    const ex = documentTextExtractor(async (images) => (await CL.readScannedPages(w.ctx, 'doc-scan', images)).pages);
    assert.equal(isScanMarker(await ex.toPages(scannedPdf())), true);
    assert.equal(w.t.seen.length, 0);
    w.app.close();
  });

  test('an encrypted PDF, a non-JPEG scan and other formats keep their marker — the reader is never asked', async () => {
    let asked = 0;
    const ex = documentTextExtractor(async () => { asked++; return [{ page: 1, lines: ['invented'] }]; });
    const enc = await ex.toPages(scannedPdf({ encrypted: true }));
    assert.equal(isMarkerPages(enc) && enc[0]!.lines[0]!.includes('encrypted'), true);
    assert.equal(isScanMarker(await ex.toPages(scannedPdf({ filter: 'JBIG2Decode' }))), true);
    const other = await ex.toPages(Buffer.from([0x00, 0x01, 0x02, 0x03, 0xfe, 0xff]));
    assert.equal(other[0]!.lines[0]!.startsWith(UNREADABLE_MARKER_PREFIX), true);
    assert.equal(asked, 0);
  });

  test('a failed or partial page reading keeps the marker — never half a document', async () => {
    for (const fx of [
      { status: 500, body: '{}' } as Fixture,
      answer({ pages: [{ page: 1, lines: [] }] }),
      answer({ pages: [{ page: 2, lines: ['a page we did not send'] }] }),
    ]) {
      const w = await world({ [MSG]: fx });
      const ex = documentTextExtractor(async (images) => (await CL.readScannedPages(w.ctx, 'doc-scan', images)).pages);
      assert.equal(isScanMarker(await ex.toPages(scannedPdf())), true);
      w.app.close();
    }
  });
});
