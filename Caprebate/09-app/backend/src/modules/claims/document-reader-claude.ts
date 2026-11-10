/**
 * THE CLAIMS' DOCUMENT READER ON THE CLAUDE API: one document's permitted segments, read for the fields its type
 * carries. Moved here from src/integrations/connectors/claude.ts by Phase 161l2 (10 November 2026), unchanged.
 *
 * The document pipeline (src/modules/claims/documents/document-pipeline.ts) decides what may leave: `sanitise()` keeps
 * only the segments a document type permits, and `callModel()` re-checks them at the boundary. This file asks the
 * question a document type needs (`specFor`), puts the payload through that boundary guard before the network, and
 * hands the call to the outside services' Claude client (src/integrations/connectors/claude.ts: the switches, the key,
 * the one way out and the scanned pages stay there). Everything the header of that file says about what happens when a
 * reading does not work (N4) holds here: no value for the field, never a guess.
 */
import type { AuditLog } from '../../core/audit.ts';
import {
  CLAUDE_EXTRACTION_SYSTEM, CLAUDE_FALLBACK_BETA, CLAUDE_MAX_TOKENS, CLAUDE_MODEL, claudeAnswerText, claudeClient, claudeReadiness, whyClaudeFailed,
  type CallResult, type ClaudeContext, type ReadState,
} from '../../integrations/index.ts';
import { callModel, PERSON_NAME_PATTERNS, PipelineError, sanitise, specFor } from './documents/document-pipeline.ts';
import type { DocType, ModelFn, ModelPayload, RawExtraction, Segment } from './documents/document-pipeline.ts';

export type ModelRead = {
  readonly state: ReadState;
  /** In plain words. No key, no text from the document. */
  readonly why: string;
  /** The model that answered — the fallback's, if the provider re-ran the request. Null when nothing answered. */
  readonly model: string | null;
  readonly fields_returned: number;
  /** Fields the answer gave that were not kept, and why, by field id. Their values are never kept. */
  readonly refused: readonly { field_id: string; why: string }[];
  readonly call: CallResult | null;
};


/** What we ask for, as a schema. Every object closed; `value_json` because a field's value can be a list or a number. */
function extractionSchema(fields: readonly string[]): Record<string, unknown> {
  return {
    type: 'object', additionalProperties: false, required: ['fields'],
    properties: {
      fields: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          required: ['field_id', 'value_json', 'confidence', 'page', 'quote_ref'],
          properties: {
            field_id: { type: 'string', enum: [...fields] },
            value_json: { type: 'string' },
            confidence: { type: 'number' },
            page: { type: 'integer' },
            quote_ref: { type: 'string' },
          },
        },
      },
    },
  };
}

function extractionPrompt(payload: ModelPayload): string {
  const spec = specFor(payload.doc_type);
  const wanted = spec.fields.map((f) => `- ${f.field_id}${f.note === undefined ? '' : ` (${f.note})`}`).join('\n');
  const sections = payload.segments
    .map((s, i) => `<section index="${i}" kind="${s.kind}" page="${s.page}">\n${s.heading}\n${s.text}\n</section>`)
    .join('\n');
  return `Document type: ${payload.doc_type}\n\nFields to report:\n${wanted}\n\n<document>\n${sections}\n</document>`;
}

/** A segment's id in the audit row: its place, kind and page. Never its heading or its words. */
function segmentIds(payload: ModelPayload): string[] {
  return payload.segments.map((s, i) => `${i}:${s.kind}:p${s.page}`);
}

/**
 * The model's answer as the pipeline's RawExtraction — keeping only what the pipeline could stand on. A field the
 * schema should have prevented but did not (unknown id, a page we did not send, no locator, confidence outside 0 to
 * 1, a value we cannot parse or that looks like a name) is REFUSED here and so stays asked. Refusing rather than
 * mending: a clamped confidence or a repaired value would be ours, not the document's.
 */
export function toRawExtraction(answer: unknown, payload: ModelPayload): { raw: RawExtraction; refused: { field_id: string; why: string }[] } {
  const raw: RawExtraction = [];
  const refused: { field_id: string; why: string }[] = [];
  const list = typeof answer === 'object' && answer !== null && Array.isArray((answer as { fields?: unknown }).fields)
    ? (answer as { fields: unknown[] }).fields : null;
  if (list === null) return { raw, refused: [{ field_id: '(all)', why: 'the answer was not in the form asked for' }] };
  const wanted = new Set(payload.fields_requested);
  const pages = new Set(payload.segments.map((s) => s.page));
  const seen = new Set<string>();
  for (const item of list) {
    const r = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    const id = typeof r.field_id === 'string' ? r.field_id : '(unnamed)';
    const no = (why: string) => { refused.push({ field_id: id, why }); };
    if (!wanted.has(id)) { no('not a field this document type carries'); continue; }
    if (seen.has(id)) { no('given twice; the first was kept'); continue; }
    if (typeof r.confidence !== 'number' || !(r.confidence >= 0 && r.confidence <= 1)) { no('its confidence was not between 0 and 1'); continue; }
    if (typeof r.page !== 'number' || !Number.isInteger(r.page) || !pages.has(r.page)) { no('it named a page we did not send'); continue; }
    if (typeof r.quote_ref !== 'string' || r.quote_ref.trim() === '') { no('it said nowhere in the document where it came from'); continue; }
    let value: unknown;
    try { value = JSON.parse(String(r.value_json)); } catch { no('its value could not be read'); continue; }
    if (value === null || value === undefined) continue; // the document does not say: the field stays asked
    const text = JSON.stringify(value);
    if (PERSON_NAME_PATTERNS.some((p) => p.test(text) || p.test(String(r.quote_ref)))) { no('it looked like a person\'s name'); continue; }
    seen.add(id);
    raw.push({ field_id: id, value, confidence: r.confidence, page: r.page, quote_ref: r.quote_ref.trim() });
  }
  return { raw, refused };
}

function writeReadRow(audit: AuditLog, ctx: ClaudeContext, at: string, payload: ModelPayload, read: ModelRead,
  usage: { input: number; output: number } | null): void {
  try {
    audit.append({
      at, kind: 'DOCUMENT_READ_BY_MODEL',
      outcome: read.state === 'READ' ? 'ALLOWED' : read.state === 'FAILED' ? 'ERROR' : 'REFUSED',
      actor_id: ctx.actor_id, actor_role: ctx.actor_role ?? null,
      object_type: 'document', object_id: payload.doc_id,
      detail: {
        doc_type: payload.doc_type, segments: segmentIds(payload), payload_sha256: payload.payload_hash,
        requested_model: CLAUDE_MODEL, model: read.model, usage,
        result: read.state, fields_requested: payload.fields_requested.length,
        fields_returned: read.fields_returned, fields_refused: read.refused.map((r) => r.field_id),
      },
    });
  } catch {
    /* As in http.ts: a row that cannot be written must not become a screen error. */
  }
}

/**
 * READ ONE DOCUMENT'S PERMITTED SEGMENTS. The payload guard first, then the switch, the key, the call and the reading.
 * Never throws, except where the guard refuses a payload the strip did not pass — which is the point of the guard.
 */
export async function readPayloadWithClaude(ctx: ClaudeContext, payload: ModelPayload): Promise<{ raw: RawExtraction; read: ModelRead }> {
  // THE GUARD, BEFORE THE NETWORK. The pipeline's own boundary check, on a throw-away egress list: it throws
  // E_FORBIDDEN_SEGMENT or E_PERSON_NAME for a payload the strip did not pass. The real egress entry is written by
  // extract(), once, when the answer is handed over.
  callModel(() => [], payload, { at: ctx.deps.now(), dropped: [], egress: [] });

  const at = ctx.deps.now();
  const none = (state: ReadState, why: string, call: CallResult | null = null, model: string | null = null,
    refused: { field_id: string; why: string }[] = []): ModelRead =>
    ({ state, why, model, fields_returned: 0, refused, call });

  const ready = claudeReadiness('DOCUMENT_READING', ctx.secrets, ctx.switches);
  if (ready.state !== 'READY') {
    const read = none(ready.state, `nothing was sent: ${ready.why}`);
    writeReadRow(ctx.deps.audit, ctx, at, payload, read, null);
    return { raw: [], read };
  }
  if (payload.segments.length === 0) {
    const read = none('NOTHING_TO_SEND', 'nothing was sent: no part of this document may be read by a model');
    writeReadRow(ctx.deps.audit, ctx, at, payload, read, null);
    return { raw: [], read };
  }

  let last: CallResult | null = null;
  const client = claudeClient(ctx, ctx.secrets.forOwner('CLAUDE_DOCUMENTS').get('ANTHROPIC_API_KEY') ?? '', (r) => { last = r; });
  try {
    const msg = await client.beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: CLAUDE_MAX_TOKENS,
      betas: [CLAUDE_FALLBACK_BETA],
      fallbacks: 'default',
      system: CLAUDE_EXTRACTION_SYSTEM,
      output_config: { format: { type: 'json_schema', schema: extractionSchema(payload.fields_requested) } },
      messages: [{ role: 'user', content: extractionPrompt(payload) }],
    });
    const usage = { input: msg.usage.input_tokens, output: msg.usage.output_tokens };
    if (msg.stop_reason === 'refusal') {
      const read = none('FAILED', 'the model declined to read it', last, msg.model);
      writeReadRow(ctx.deps.audit, ctx, at, payload, read, usage);
      return { raw: [], read };
    }
    const text = claudeAnswerText(msg);
    let answer: unknown = null;
    try { answer = text === null ? null : JSON.parse(text); } catch { answer = null; }
    if (answer === null) {
      const why = msg.stop_reason === 'max_tokens' ? 'the answer was cut off before it finished' : 'the answer was not in the form asked for';
      const read = none('FAILED', why, last, msg.model);
      writeReadRow(ctx.deps.audit, ctx, at, payload, read, usage);
      return { raw: [], read };
    }
    const { raw, refused } = toRawExtraction(answer, payload);
    const read: ModelRead = {
      state: 'READ', why: `read: ${raw.length} of ${payload.fields_requested.length} fields found`,
      model: msg.model, fields_returned: raw.length, refused, call: last,
    };
    writeReadRow(ctx.deps.audit, ctx, at, payload, read, usage);
    return { raw, read };
  } catch (e) {
    const read = none('FAILED', `the reading did not work: ${whyClaudeFailed(e, last)}`, last);
    writeReadRow(ctx.deps.audit, ctx, at, payload, read, null);
    return { raw: [], read };
  }
}

/**
 * THE MODEL FOR ONE DOCUMENT, READY TO HAND TO `runExtraction()`. Builds the payload exactly as `extract()` will (the
 * same `sanitise()` on the same retained segments), reads it, and returns a synchronous `ModelFn` that gives that
 * answer to that payload and to no other.
 */
export async function prepareClaudeModel(
  ctx: ClaudeContext, doc_id: string, doc_type: DocType, retained: readonly Segment[],
): Promise<{ model: ModelFn; read: ModelRead }> {
  const { payload } = sanitise(doc_id, doc_type, retained);
  const { raw, read } = await readPayloadWithClaude(ctx, payload);
  const model: ModelFn = (p) => {
    if (p.payload_hash !== payload.payload_hash) {
      throw new PipelineError('E_PAYLOAD_CHANGED', 'the payload is not the one that was read', { doc_id: p.doc_id });
    }
    return raw;
  };
  return { model, read };
}

