/**
 * Caprebate — Reconciliation Engine
 * Board item 12830181808. Phase 3, item 2. Builds on item 12830181420.
 *
 * Multiple sources will disagree. The EPC says 1,200 m2, the OS footprint
 * implies 1,340, the client says "about 1,400". The engine holds all three.
 * It does not pick one and forget the others.
 *
 * Outputs three things:
 *   1. a conflict register  — every disagreement, recorded
 *   2. a confidence per field — how far this field can be trusted on THIS job
 *   3. a capture list       — the specific questions a human must be asked
 *
 * Governing principle (schema §0.3, invariant I-1): a null routes to capture
 * and is NEVER guessed. A confident wrong number is more dangerous than a gap.
 */

import {
  type AnyCell, type Cell, type Grade, type ProvCode,
  SourceRegister, ProvenanceStore, worstGrade,
} from './caprebate-source-register.ts';

/* ------------------------------------------------------------------ *
 * 1. Field specification
 * ------------------------------------------------------------------ */

export type FieldKind = 'numeric' | 'currency' | 'enum' | 'bool' | 'date' | 'text' | 'ref';

export type Audience = 'CLIENT' | 'SURVEYOR' | 'CTA' | 'SYSTEM';

export type Tolerance = {
  /** Fractional, e.g. 0.02 = 2%. Applied to the smaller of the pair. */
  relative?: number;
  /** In the field's own unit. Two values agree if within EITHER bound. */
  absolute?: number;
  /** For dates, in days. */
  days?: number;
};

export type FieldSpec = {
  /** The canonical field the engine resolves. */
  field_id: string;
  /**
   * The source-native field ids that are claims about this same concept.
   * The EPC calls it `epc_total_floor_area_m2`, the VOA `voa_total_area_m2`,
   * the client `gia_m2`. Three names, one quantity, three claims — and each
   * source may only write under its own name, per the name/field whitelist in
   * the source register. Defaults to [field_id].
   */
  claims_from?: readonly string[];
  kind: FieldKind;
  /** Schema §0.3 GATE fields: I-17 applies, and an unsettled gate blocks. */
  gate: boolean;
  /** What counts as the same number. Rounding only, not "close enough". */
  tolerance: Tolerance;
  /** The actual words put to a human when the field cannot settle itself. */
  question: string;
  /** Who is asked when the field is simply absent. */
  asked_of: Audience;
  /** Who is asked when the first audience has already said UNKNOWN. */
  escalate_to: Audience;
  unit?: string;
};

/* ------------------------------------------------------------------ *
 * 2. Independence
 *
 * Corroboration requires two INDEPENDENT sources. The client saying the same
 * thing on the form and in an uploaded document is one source saying it twice.
 * ------------------------------------------------------------------ */

export type IndependenceClass = 'REGISTER' | 'CLIENT' | 'OURS';

const INDEPENDENCE: Record<string, IndependenceClass> = {
  CH_COMPANY: 'REGISTER', CH_PSC: 'REGISTER', HMLR_PPD: 'REGISTER', HMLR_TITLE: 'REGISTER',
  CQC: 'REGISTER', CIW: 'REGISTER', EPC: 'REGISTER', VOA: 'REGISTER', PLANNING: 'REGISTER',
  BCIS: 'REGISTER',
  CLIENT_ANSWER: 'CLIENT', CLIENT_DOC: 'CLIENT',
  SURVEYOR: 'OURS', CTA: 'OURS', ENGINE: 'OURS',
};

export function independenceOf(source_id: string): IndependenceClass {
  const c = INDEPENDENCE[source_id];
  if (!c) throw new ReconciliationError('E_UNKNOWN_SOURCE_CLASS', `source '${source_id}' has no independence class`);
  return c;
}

/**
 * A claim whose own document was never verified as being about the subject
 * property cannot corroborate anything (12902224596, document_property_match).
 * NOT_STATED is the common case — the richest document type, the O&M plant
 * schedule, usually carries no address at all — so the claim itself is still
 * usable, but it may not count as the second, independent voice that turns a
 * SINGLE_SOURCE claim into a CORROBORATED one. This is the same principle
 * already applied to a surveyor's self-accepted pre-fill: unverified provenance
 * is not independent evidence, wherever it shows up. MISMATCH is included for
 * belt and braces — such a claim is never written today, but if that changes,
 * corroboration must not silently start relying on it.
 */
function propertyMatchBlocksCorroboration(c: AnyCell): boolean {
  const pm = c.prov.retrieval.property_match;
  return pm === 'NOT_STATED' || pm === 'MISMATCH';
}

/**
 * Two claims are independent if they come from different independence classes,
 * or from two different REGISTER publishers. Two REGISTER rows from the same
 * publisher are one publisher.
 */
export function areIndependent(a: AnyCell, b: AnyCell): boolean {
  if (propertyMatchBlocksCorroboration(a) || propertyMatchBlocksCorroboration(b)) return false;
  const ca = independenceOf(a.prov.source_id);
  const cb = independenceOf(b.prov.source_id);
  if (ca !== cb) return true;
  if (ca === 'REGISTER') return a.prov.publisher !== b.prov.publisher;
  return false;
}

export class ReconciliationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = 'ReconciliationError';
    this.code = code;
  }
}

/* ------------------------------------------------------------------ *
 * 3. Agreement
 * ------------------------------------------------------------------ */

export function agree(spec: FieldSpec, a: unknown, b: unknown): boolean {
  switch (spec.kind) {
    case 'numeric':
    case 'currency': {
      const x = Number(a);
      const y = Number(b);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
      const diff = Math.abs(x - y);
      const base = Math.min(Math.abs(x), Math.abs(y));
      if (spec.tolerance.absolute !== undefined && diff <= spec.tolerance.absolute) return true;
      if (spec.tolerance.relative !== undefined && base > 0 && diff / base <= spec.tolerance.relative) return true;
      return diff === 0;
    }
    case 'date': {
      const x = Date.parse(String(a));
      const y = Date.parse(String(b));
      if (Number.isNaN(x) || Number.isNaN(y)) return false;
      const days = Math.abs(x - y) / 86_400_000;
      return days <= (spec.tolerance.days ?? 0);
    }
    case 'text':
      return String(a).trim().toLowerCase().replace(/\s+/g, ' ') === String(b).trim().toLowerCase().replace(/\s+/g, ' ');
    case 'enum':
    case 'bool':
    case 'ref':
    default:
      return a === b;
  }
}

/** How far apart the claims are, for the conflict register. */
export function spreadOf(spec: FieldSpec, values: readonly unknown[]): { absolute: number | null; relative: number | null } {
  if (spec.kind !== 'numeric' && spec.kind !== 'currency') return { absolute: null, relative: null };
  const nums = values.map(Number).filter((n) => Number.isFinite(n));
  if (nums.length < 2) return { absolute: null, relative: null };
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  return {
    absolute: Math.round((hi - lo) * 1000) / 1000,
    relative: lo === 0 ? null : Math.round(((hi - lo) / lo) * 10_000) / 10_000,
  };
}

/* ------------------------------------------------------------------ *
 * 4. Clustering — complete linkage, deliberately
 *
 * Single linkage would chain 1200 ~ 1250 ~ 1300 into one "agreeing" group when
 * the ends plainly disagree. A group here is a set in which EVERY pair agrees.
 * ------------------------------------------------------------------ */

const GRADE_RANK: Record<Grade, number> = { A: 0, B: 1, C: 2, D: 3, E: 4 };

export type ClaimGroup = {
  claims: AnyCell[];
  /** Best-evidence claim in the group. */
  representative: AnyCell;
  independent_classes: IndependenceClass[];
};

export function cluster(spec: FieldSpec, claims: readonly AnyCell[]): ClaimGroup[] {
  // Deterministic order: best grade first, then oldest retrieval, then source id.
  const ordered = [...claims].sort((a, b) => {
    const g = GRADE_RANK[a.prov.grade] - GRADE_RANK[b.prov.grade];
    if (g !== 0) return g;
    const t = Date.parse(b.prov.retrieval.retrieved_at) - Date.parse(a.prov.retrieval.retrieved_at);
    if (t !== 0) return t;
    return a.prov.source_id.localeCompare(b.prov.source_id);
  });

  const groups: AnyCell[][] = [];
  for (const c of ordered) {
    const home = groups.find((g) => g.every((m) => agree(spec, m.value, c.value)));
    if (home) home.push(c);
    else groups.push([c]);
  }

  return groups.map((g) => ({
    claims: g,
    representative: g[0],
    independent_classes: [...new Set(g.map((c) => independenceOf(c.prov.source_id)))],
  }));
}

/* ------------------------------------------------------------------ *
 * 5. Conflict register
 * ------------------------------------------------------------------ */

export type ConflictSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export type ConflictClaim = {
  source_id: string;
  publisher: string;
  prov: ProvCode;
  grade: Grade;
  value: unknown;
  retrieved_at: string;
  locator: string;
};

export type Conflict = {
  conflict_id: string;
  entity_id: string;
  field_id: string;
  /** Every claim, in full. Nothing is dropped because it lost. */
  claims: ConflictClaim[];
  /** One entry per agreeing group — the distinct positions actually held. */
  positions: { value: unknown; sources: string[]; best_grade: Grade }[];
  spread_absolute: number | null;
  spread_relative: number | null;
  severity: ConflictSeverity;
  gate: boolean;
  status: 'OPEN' | 'RESOLVED_BY_TOLERANCE' | 'RESOLVED_BY_HUMAN';
  /** Set when a human settles it. Never set by the engine. */
  resolution: { value: unknown; settled_by: Audience; note: string; settled_at: string } | null;
  opened_at: string;
};

function toConflictClaim(c: AnyCell): ConflictClaim {
  return {
    source_id: c.prov.source_id,
    publisher: c.prov.publisher,
    prov: c.prov.prov,
    grade: c.prov.grade,
    value: c.value,
    retrieved_at: c.prov.retrieval.retrieved_at,
    locator: c.prov.retrieval.locator,
  };
}

function severityOf(spec: FieldSpec, groups: ClaimGroup[], spread: { relative: number | null }): ConflictSeverity {
  if (groups.length <= 1) return 'LOW';
  if (spec.gate) return 'HIGH';
  const tol = spec.tolerance.relative;
  if (tol === undefined || spread.relative === null) return 'MEDIUM';
  if (spread.relative > tol * 5) return 'HIGH';
  if (spread.relative > tol * 2) return 'MEDIUM';
  return 'LOW';
}

/* ------------------------------------------------------------------ *
 * 6. Confidence — per field, per job
 *
 * NOT a mutation of the schema grade. §0.5 says the grade is a property of the
 * field, not of a job, so the grade is carried through untouched and the
 * job-specific judgement lives here, in gate_ready.
 * ------------------------------------------------------------------ */

export type ConfidenceBasis =
  | 'CORROBORATED'      // two or more independent sources agree
  | 'SINGLE_SOURCE'     // one source, nothing to check it against
  | 'CONTESTED'         // sources materially disagree; no value chosen
  | 'UNKNOWN'           // asked, not known
  | 'ABSENT';           // never asked

export type FieldConfidence = {
  field_id: string;
  grade: Grade | null;
  basis: ConfidenceBasis;
  corroborating_sources: string[];
  /**
   * I-17: a C-grade field may not drive a GATE uncorroborated. True iff the
   * grade is A or B, or a C corroborated by an A or B source.
   */
  gate_ready: boolean;
  /** I-3: an unresolved D or E blocks the sign-off-ready output. */
  blocks_signoff: boolean;
};

/* ------------------------------------------------------------------ *
 * 7. Capture list
 * ------------------------------------------------------------------ */

export type CaptureReason =
  | 'ABSENT'              // no claim at all. Never guessed.
  | 'UNKNOWN'             // asked; the answer is not known. Escalate, do not re-ask.
  | 'CONTESTED'           // sources disagree materially. A human chooses between evidenced options.
  | 'UNCORROBORATED_GATE' // I-17: a C-grade claim alone may not drive a gate.
  | 'JUDGEMENT_REQUIRED'  // D or E: the human sign-off is structural, not a fallback.
  | 'STALE';              // the evidence is older than the licence permits. Re-fetch, do not re-ask.

export type CaptureOption = { value: unknown; source_id: string; publisher: string; grade: Grade; retrieved_at: string };

export type CaptureRequest = {
  capture_id: string;
  entity_id: string;
  field_id: string;
  reason: CaptureReason;
  /** The words to put in front of a person. Not a field name. */
  question: string;
  asked_of: Audience;
  priority: 1 | 2 | 3;
  blocks_signoff: boolean;
  /**
   * For CONTESTED: the candidate values with their evidence, so the human is
   * choosing between sourced options rather than being asked to guess.
   */
  options: CaptureOption[];
  conflict_id: string | null;
};

/* ------------------------------------------------------------------ *
 * 8. The engine
 * ------------------------------------------------------------------ */

export type Resolution = {
  entity_id: string;
  field_id: string;
  /** Null whenever the engine declined to choose. Null is never a value here. */
  value: unknown | null;
  /** The cell the value came from, or null. */
  chosen: AnyCell | null;
  confidence: FieldConfidence;
  conflict: Conflict | null;
  captures: CaptureRequest[];
};

export type ReconcileOptions = {
  clock?: () => string;
  /** Cells older than their licence window are surfaced as STALE captures. */
  staleFieldIds?: readonly string[];
};

let seq = 0;
function nextId(prefix: string, entity: string, field: string): string {
  seq += 1;
  return `${prefix}-${entity}-${field}-${String(seq).padStart(4, '0')}`;
}

/** Reset the id counter. Tests only. */
export function __resetIds(): void {
  seq = 0;
}

export function reconcileField(
  spec: FieldSpec,
  entity_id: string,
  claims: readonly AnyCell[],
  opts: ReconcileOptions = {},
): Resolution {
  const now = opts.clock ? opts.clock() : new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const captures: CaptureRequest[] = [];

  const known = claims.filter((c) => c.state === 'VALUE');
  const unknowns = claims.filter((c) => c.state === 'UNKNOWN');

  const mkCapture = (
    reason: CaptureReason,
    asked_of: Audience,
    priority: 1 | 2 | 3,
    options: CaptureOption[],
    conflict_id: string | null,
    question?: string,
  ): CaptureRequest => ({
    capture_id: nextId('CAP', entity_id, spec.field_id),
    entity_id,
    field_id: spec.field_id,
    reason,
    question: question ?? spec.question,
    asked_of,
    priority,
    blocks_signoff: spec.gate || reason === 'JUDGEMENT_REQUIRED',
    options,
    conflict_id,
  });

  const asOption = (c: AnyCell): CaptureOption => ({
    value: c.value,
    source_id: c.prov.source_id,
    publisher: c.prov.publisher,
    grade: c.prov.grade,
    retrieved_at: c.prov.retrieval.retrieved_at,
  });

  // ---- no claim at all. The null routes to capture. It is never guessed. ----
  if (claims.length === 0) {
    captures.push(mkCapture('ABSENT', spec.asked_of, spec.gate ? 1 : 2, [], null));
    return {
      entity_id, field_id: spec.field_id, value: null, chosen: null, conflict: null, captures,
      confidence: {
        field_id: spec.field_id, grade: null, basis: 'ABSENT',
        corroborating_sources: [], gate_ready: false, blocks_signoff: spec.gate,
      },
    };
  }

  // ---- every claim is UNKNOWN. Asked and not known: escalate, do not re-ask. ----
  if (known.length === 0) {
    captures.push(
      mkCapture(
        'UNKNOWN', spec.escalate_to, 1, [], null,
        `${spec.question} (Already put to ${unknowns[0].prov.publisher}, who does not know. ` +
          'Do not re-ask — establish it from a document or on site.)',
      ),
    );
    return {
      entity_id, field_id: spec.field_id, value: null, chosen: null, conflict: null, captures,
      confidence: {
        field_id: spec.field_id, grade: null, basis: 'UNKNOWN',
        corroborating_sources: [], gate_ready: false, blocks_signoff: spec.gate,
      },
    };
  }

  const groups = cluster(spec, known);
  const spread = spreadOf(spec, known.map((c) => c.value));

  const conflict: Conflict | null =
    groups.length > 1
      ? {
          conflict_id: nextId('CFL', entity_id, spec.field_id),
          entity_id,
          field_id: spec.field_id,
          claims: known.map(toConflictClaim),
          positions: groups.map((g) => ({
            value: g.representative.value,
            sources: g.claims.map((c) => c.prov.source_id),
            best_grade: g.representative.prov.grade,
          })),
          spread_absolute: spread.absolute,
          spread_relative: spread.relative,
          severity: severityOf(spec, groups, spread),
          gate: spec.gate,
          status: 'OPEN',
          resolution: null,
          opened_at: now,
        }
      : null;

  // ---- material disagreement. Hold all positions; choose nothing. ----
  if (conflict) {
    captures.push(
      mkCapture(
        'CONTESTED', spec.escalate_to === 'SYSTEM' ? spec.asked_of : spec.escalate_to, 1,
        groups.map((g) => asOption(g.representative)), conflict.conflict_id,
        `${spec.question} Sources disagree: ` +
          groups.map((g) => `${String(g.representative.value)}${spec.unit ? ' ' + spec.unit : ''} (${g.claims.map((c) => c.prov.publisher).join(', ')})`).join(' vs ') +
          '. Which figure is correct, and on what basis?',
      ),
    );
    return {
      entity_id, field_id: spec.field_id, value: null, chosen: null, conflict, captures,
      confidence: {
        field_id: spec.field_id,
        grade: worstGrade(known.map((c) => c.prov.grade)),
        basis: 'CONTESTED',
        corroborating_sources: [],
        gate_ready: false,
        blocks_signoff: spec.gate,
      },
    };
  }

  // ---- one agreeing group. Best evidence wins; the others are still recorded. ----
  const g = groups[0];
  const chosen = g.representative;
  const others = g.claims.filter((c) => c !== chosen);
  const corroborators = others.filter((c) => areIndependent(chosen, c));
  const corroborated = corroborators.length > 0;

  const grade = chosen.prov.grade;
  const bestCorroboratorGrade = corroborators.length
    ? corroborators.map((c) => c.prov.grade).sort((a, b) => GRADE_RANK[a] - GRADE_RANK[b])[0]
    : null;

  // I-17: a C may drive a gate once an A or B backs it, and not before.
  const gate_ready =
    grade === 'A' || grade === 'B'
      ? true
      : grade === 'C'
        ? bestCorroboratorGrade === 'A' || bestCorroboratorGrade === 'B'
        : false; // D and E are never gate-ready without the human sign-off

  const blocks_signoff = grade === 'D' || grade === 'E' || (spec.gate && !gate_ready);

  if (spec.gate && !gate_ready && (grade === 'C')) {
    captures.push(
      mkCapture(
        'UNCORROBORATED_GATE', spec.escalate_to, 1, [asOption(chosen)], null,
        `${spec.question} Currently held only on ${chosen.prov.publisher}'s unverified assertion ` +
          `(grade C). This field drives a gate and needs an independent A- or B-grade source before it may do so.`,
      ),
    );
  }

  if (grade === 'D' || grade === 'E') {
    captures.push(
      mkCapture(
        'JUDGEMENT_REQUIRED', grade === 'E' ? 'CTA' : 'SURVEYOR', 1, [asOption(chosen)], null,
        `${spec.question} Drafted at ${String(chosen.value)}${spec.unit ? ' ' + spec.unit : ''}. ` +
          `Confirm or amend — ${grade === 'E' ? 'a CTA filing-position judgement' : 'a chartered-surveyor judgement'}, ` +
          'which AI may draft and may never finalise.',
      ),
    );
  }

  if (opts.staleFieldIds?.includes(spec.field_id)) {
    captures.push(
      mkCapture('STALE', 'SYSTEM', 2, [asOption(chosen)], null,
        `Re-fetch ${spec.field_id} from ${chosen.prov.publisher}: the held value is older than the licence permits.`),
    );
  }

  return {
    entity_id,
    field_id: spec.field_id,
    value: chosen.value,
    chosen,
    conflict: null,
    captures,
    confidence: {
      field_id: spec.field_id,
      grade,
      basis: corroborated ? 'CORROBORATED' : 'SINGLE_SOURCE',
      corroborating_sources: corroborators.map((c) => c.prov.source_id),
      gate_ready,
      blocks_signoff,
    },
  };
}

/* ------------------------------------------------------------------ *
 * 9. Job-level report
 * ------------------------------------------------------------------ */

export type ReconciliationReport = {
  entity_id: string;
  resolutions: Resolution[];
  conflict_register: Conflict[];
  capture_list: CaptureRequest[];
  confidence: FieldConfidence[];
  /** True while anything blocks the sign-off-ready output (I-3). */
  signoff_blocked: boolean;
  blockers: { field_id: string; reason: string }[];
};

export function reconcile(
  specs: readonly FieldSpec[],
  entity_id: string,
  claimsByField: Readonly<Record<string, readonly AnyCell[]>>,
  opts: ReconcileOptions = {},
): ReconciliationReport {
  const resolutions = specs.map((s) => reconcileField(s, entity_id, claimsByField[s.field_id] ?? [], opts));
  const conflict_register = resolutions.map((r) => r.conflict).filter((c): c is Conflict => c !== null);
  const capture_list = resolutions
    .flatMap((r) => r.captures)
    .sort((a, b) => a.priority - b.priority || a.field_id.localeCompare(b.field_id));
  const confidence = resolutions.map((r) => r.confidence);

  const blockers = resolutions
    .filter((r) => r.confidence.blocks_signoff)
    .map((r) => ({
      field_id: r.field_id,
      reason:
        r.confidence.basis === 'ABSENT' ? 'not captured'
          : r.confidence.basis === 'UNKNOWN' ? 'client does not know; not yet established'
            : r.confidence.basis === 'CONTESTED' ? 'sources disagree; unresolved'
              : r.confidence.grade === 'E' ? 'CTA sign-off outstanding'
                : r.confidence.grade === 'D' ? 'surveyor sign-off outstanding'
                  : 'gate held on an uncorroborated C-grade source (I-17)',
    }));

  return {
    entity_id,
    resolutions,
    conflict_register,
    capture_list,
    confidence,
    signoff_blocked: blockers.length > 0,
    blockers,
  };
}

/**
 * Settle a conflict with a human decision. The engine never calls this itself —
 * that is the point. The chosen value must be one of the recorded positions, or
 * a new value the human supplies with a note explaining it.
 */
export function settleConflict(
  conflict: Conflict,
  decision: { value: unknown; settled_by: Audience; note: string; settled_at: string },
): Conflict {
  if (!decision.note || decision.note.trim().length === 0) {
    throw new ReconciliationError('E_NO_NOTE', `settling conflict ${conflict.conflict_id} requires a note stating the basis`);
  }
  return { ...conflict, status: 'RESOLVED_BY_HUMAN', resolution: decision };
}

/* ------------------------------------------------------------------ *
 * 10. Convenience: pull the claims for a field out of the provenance store
 * ------------------------------------------------------------------ */

export function claimsFromStore(store: ProvenanceStore, entity_id: string, field_id: string): readonly AnyCell[] {
  return store.history(entity_id, field_id);
}

/**
 * Every claim about one canonical field, gathered across the source-native
 * names it goes by. `history` rather than `get`, because a superseded value is
 * still a claim: it is evidence that at some point a publisher said something
 * different, and the conflict register wants it.
 */
export function gatherClaims(store: ProvenanceStore, entity_id: string, spec: FieldSpec): readonly AnyCell[] {
  const names = spec.claims_from ?? [spec.field_id];
  return names.flatMap((n) => store.history(entity_id, n));
}

/** Reconcile a whole job straight out of the provenance store. */
export function reconcileFromStore(
  specs: readonly FieldSpec[],
  entity_id: string,
  store: ProvenanceStore,
  opts: ReconcileOptions = {},
): ReconciliationReport {
  const byField: Record<string, readonly AnyCell[]> = {};
  for (const s of specs) byField[s.field_id] = gatherClaims(store, entity_id, s);
  return reconcile(specs, entity_id, byField, opts);
}

export { type AnyCell, type Cell, type Grade, SourceRegister, ProvenanceStore };
