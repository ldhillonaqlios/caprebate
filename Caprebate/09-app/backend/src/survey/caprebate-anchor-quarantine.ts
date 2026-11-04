/**
 * Caprebate — Anchor Quarantine
 * Board item 12830183464. Phase 3, item 4.
 *
 * Anchoring is real and well evidenced: a surveyor who has seen our estimate
 * before forming their own view drifts toward it. That drift destroys the
 * independence which is the only thing making their signature worth anything.
 *
 * So the client-facing ESTIMATE is withheld from the surveyor until they have
 * committed their own figures. Three parts:
 *
 *   1. the quarantine     — structurally unreadable, not merely hidden in a UI
 *   2. the release        — automatic on commitment; no discretion, no queue-jumping
 *   3. the log            — append-only, hash-chained, timestamped. The evidence
 *                           that the process was followed.
 *
 * The quarantine does a second job nobody asked for but everyone needs: by
 * freezing the surveyor's pre-release figures it MEASURES anchoring, because
 * post-release amendments can be compared against the estimate they were
 * exposed to. That measurement feeds 12830166861 and 12818968809.
 */

import { createHash } from 'node:crypto';

/* ------------------------------------------------------------------ *
 * 1. Roles
 *
 * Only the surveyor is quarantined. This matters: the estimate is not a secret,
 * it is simply not shown to THIS ONE PERSON until they have committed. Anyone
 * else can discuss it with the client at any time, which is what removes the
 * usual reason for wanting an early-release exception.
 * ------------------------------------------------------------------ */

export type Role = 'SURVEYOR' | 'ANALYST' | 'CLIENT_MANAGER' | 'CTA' | 'CLIENT';

export const QUARANTINED_ROLES: readonly Role[] = ['SURVEYOR'];

export type Viewer = { user_id: string; role: Role };

export class QuarantineError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = 'QuarantineError';
    this.code = code;
  }
}

/* ------------------------------------------------------------------ *
 * 2. What is quarantined, and what is not
 *
 * OUTPUTS are quarantined. INPUTS flow freely.
 *
 * The client's own answers, uploaded documents and register data are inputs the
 * surveyor needs in order to do the survey at all; withholding them would
 * degrade the work without protecting anything. What anchors is our NUMBER, and
 * everything from which our number can be reconstructed.
 * ------------------------------------------------------------------ */

export type EstimateOutputs = {
  /** The headline figure the client saw, in integer pence. */
  qualifying_expenditure_pence: number;
  /** Same anchor in a different unit — quarantined for exactly that reason. */
  qualifying_pct: number;
  pool_split_main_pence: number;
  pool_split_special_pence: number;
  bare_land_pence: number;
  multiplier: number;
  indicative_lifetime_saving_pence: number;
  /** Anything else the client-facing output showed. */
  extras?: Record<string, number | string>;
};

/** Not quarantined. Named here so the boundary is explicit rather than assumed. */
export const RELEASED_TO_SURVEYOR_ALWAYS: readonly string[] = [
  'client answers',
  'client uploaded documents',
  'register data (HMLR, EPC, VOA, CQC, Companies House)',
  'gross internal area and floor plans',
  'room schedule and fixtures inventory',
  'title, tenure, price paid, completion date',
  'the reconciliation capture list (12830181808)',
];

/* ------------------------------------------------------------------ *
 * 3. The log — append-only, hash-chained
 * ------------------------------------------------------------------ */

export type LogKind =
  | 'QUARANTINE_CREATED'
  | 'ESTIMATE_SEALED'
  | 'SURVEYOR_ASSIGNED'
  | 'ACCESS_DENIED'            // an attempt to read while quarantined. Evidence in its own right.
  | 'COMMITMENT_RECORDED'
  | 'RELEASED'
  | 'ESTIMATE_VIEWED'
  | 'POST_RELEASE_AMENDMENT'
  | 'CLIENT_DISCLOSURE_REPORTED'; // the surveyor self-reports that the client told them the figure

export type LogEntry = {
  seq: number;
  kind: LogKind;
  job_id: string;
  actor: string;
  at: string;
  detail: Record<string, unknown>;
  /** sha256 over prev_hash + the canonical entry. Removal or reordering is detectable. */
  prev_hash: string;
  hash: string;
};

function canonical(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

export const GENESIS = '0'.repeat(64);

export type ChainCheck = { intact: boolean; broken_at: number | null };

/**
 * Verifies a hash chain read back from anywhere — the live log, a database, a
 * file handed to an auditor. Recomputing from the entries is the point: a chain
 * you can only verify through the object that produced it proves nothing.
 */
export function verifyChain(entries: readonly LogEntry[]): ChainCheck {
  let prev = GENESIS;
  for (const e of entries) {
    const body = { seq: e.seq, kind: e.kind, job_id: e.job_id, actor: e.actor, at: e.at, detail: e.detail, prev_hash: prev };
    const hash = createHash('sha256').update(canonical(body)).digest('hex');
    if (hash !== e.hash || e.prev_hash !== prev) return { intact: false, broken_at: e.seq };
    prev = e.hash;
  }
  return { intact: true, broken_at: null };
}

export class AnchorLog {
  #entries: LogEntry[] = [];

  append(e: Omit<LogEntry, 'seq' | 'prev_hash' | 'hash'>): LogEntry {
    const prev_hash = this.#entries.length ? this.#entries[this.#entries.length - 1].hash : GENESIS;
    const seq = this.#entries.length + 1;
    const body = { seq, kind: e.kind, job_id: e.job_id, actor: e.actor, at: e.at, detail: e.detail, prev_hash };
    const hash = createHash('sha256').update(canonical(body)).digest('hex');
    const entry: LogEntry = { ...body, hash };
    this.#entries.push(entry);
    return entry;
  }

  entries(): readonly LogEntry[] {
    return [...this.#entries];
  }

  of(job_id: string): readonly LogEntry[] {
    return this.#entries.filter((e) => e.job_id === job_id);
  }

  /** Recomputes the whole chain. Any removal, edit or reordering shows up here. */
  verify(): ChainCheck {
    return verifyChain(this.#entries);
  }
}

/* ------------------------------------------------------------------ *
 * 4. Commitment
 * ------------------------------------------------------------------ */

/** The surveyor's own figures, in integer pence except the percentage. */
export type SurveyorFigures = {
  A_qualifying_plant_pence: number;
  B_building_pence: number;
  C_bare_land_pence: number;
  qualifying_pct: number;
};

export type Commitment = {
  job_id: string;
  surveyor_id: string;
  figures: SurveyorFigures;
  committed_at: string;
  /** Content hash. The committed figures cannot be quietly rewritten later. */
  hash: string;
  method_note: string;
};

export function hashFigures(f: SurveyorFigures): string {
  return createHash('sha256').update(canonical(f)).digest('hex');
}

/* ------------------------------------------------------------------ *
 * 5. The quarantine
 * ------------------------------------------------------------------ */

export type QuarantineState = 'SEALED' | 'COMMITTED_AND_RELEASED';

export type Amendment = {
  job_id: string;
  surveyor_id: string;
  at: string;
  from: SurveyorFigures;
  to: SurveyorFigures;
  /** Mandatory. An unexplained post-release change is indistinguishable from drift. */
  reason: string;
};

export type Clock = () => string;

export class AnchorQuarantine {
  /** Private. There is no getter. The only reader is openEstimate(), which checks state. */
  #estimate: EstimateOutputs;
  #log: AnchorLog;
  #clock: Clock;

  job_id: string;
  state: QuarantineState = 'SEALED';
  surveyor_id: string | null = null;
  commitment: Commitment | null = null;
  released_at: string | null = null;
  amendments: Amendment[] = [];
  /** True once the surveyor has been exposed to the estimate by any route. */
  anchor_exposed = false;
  estimate_hash: string;

  constructor(opts: { job_id: string; estimate: EstimateOutputs; log: AnchorLog; clock: Clock; sealed_by: string }) {
    this.job_id = opts.job_id;
    this.#estimate = opts.estimate;
    this.#log = opts.log;
    this.#clock = opts.clock;
    this.estimate_hash = createHash('sha256').update(canonical(opts.estimate)).digest('hex');

    this.#log.append({
      kind: 'QUARANTINE_CREATED', job_id: this.job_id, actor: opts.sealed_by, at: this.#clock(),
      detail: { quarantined_roles: QUARANTINED_ROLES },
    });
    this.#log.append({
      kind: 'ESTIMATE_SEALED', job_id: this.job_id, actor: opts.sealed_by, at: this.#clock(),
      // The hash, never the figures. The log itself must not leak the anchor.
      detail: { estimate_hash: this.estimate_hash },
    });
  }

  assignSurveyor(surveyor_id: string, assigned_by: string): void {
    this.surveyor_id = surveyor_id;
    this.#log.append({
      kind: 'SURVEYOR_ASSIGNED', job_id: this.job_id, actor: assigned_by, at: this.#clock(),
      detail: { surveyor_id },
    });
  }

  /**
   * The only reader. A quarantined role before release gets an exception AND a
   * log entry — the denied attempt is evidence in its own right.
   */
  openEstimate(viewer: Viewer): EstimateOutputs {
    const quarantined = QUARANTINED_ROLES.includes(viewer.role);
    if (quarantined && this.state === 'SEALED') {
      this.#log.append({
        kind: 'ACCESS_DENIED', job_id: this.job_id, actor: viewer.user_id, at: this.#clock(),
        detail: { role: viewer.role, reason: 'estimate is quarantined pending surveyor commitment' },
      });
      throw new QuarantineError(
        'E_QUARANTINED',
        `the client estimate for job ${this.job_id} is withheld from the surveyor until their own figures ` +
          'are committed. Commit your figures and it will be released automatically.',
      );
    }
    this.#log.append({
      kind: 'ESTIMATE_VIEWED', job_id: this.job_id, actor: viewer.user_id, at: this.#clock(),
      detail: { role: viewer.role, state: this.state },
    });
    if (quarantined) this.anchor_exposed = true;
    return this.#estimate;
  }

  /**
   * Recording the commitment releases the estimate automatically. There is no
   * separate release action, so there is nobody to ask for early access.
   */
  commit(input: { surveyor_id: string; figures: SurveyorFigures; method_note: string }): Commitment {
    if (this.state !== 'SEALED') {
      throw new QuarantineError('E_ALREADY_COMMITTED', `job ${this.job_id} has already been committed and released`);
    }
    if (this.surveyor_id && this.surveyor_id !== input.surveyor_id) {
      throw new QuarantineError(
        'E_WRONG_SURVEYOR',
        `job ${this.job_id} is assigned to ${this.surveyor_id}; ${input.surveyor_id} cannot commit it`,
      );
    }
    if (!input.method_note || input.method_note.trim().length === 0) {
      throw new QuarantineError('E_NO_METHOD', 'a commitment must state the basis on which the figures were reached');
    }
    for (const [k, v] of Object.entries(input.figures)) {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new QuarantineError('E_BAD_FIGURE', `committed figure '${k}' is not a finite number`);
      }
    }

    const at = this.#clock();
    const commitment: Commitment = {
      job_id: this.job_id,
      surveyor_id: input.surveyor_id,
      figures: input.figures,
      committed_at: at,
      hash: hashFigures(input.figures),
      method_note: input.method_note,
    };
    this.commitment = commitment;
    this.#log.append({
      kind: 'COMMITMENT_RECORDED', job_id: this.job_id, actor: input.surveyor_id, at,
      // The committed figures ARE logged: they are the surveyor's own, so there is
      // no anchor to protect, and their presence in the log is what makes the drift
      // measurement evidential rather than assertable.
      detail: { figures: input.figures, figures_hash: commitment.hash, method_note: input.method_note },
    });

    this.state = 'COMMITTED_AND_RELEASED';
    this.released_at = this.#clock();
    this.#log.append({
      kind: 'RELEASED', job_id: this.job_id, actor: 'system', at: this.released_at,
      detail: { trigger: 'commitment recorded', estimate_hash: this.estimate_hash, surveyor_id: input.surveyor_id },
    });
    return commitment;
  }

  /**
   * The surveyor may change their figures after release — they must be able to,
   * if the estimate reveals a genuine error. Every change is recorded with a
   * mandatory reason, because an unexplained post-release change is
   * indistinguishable from drift.
   */
  amend(input: { surveyor_id: string; to: SurveyorFigures; reason: string }): Amendment {
    if (this.state !== 'COMMITTED_AND_RELEASED' || !this.commitment) {
      throw new QuarantineError('E_NOT_COMMITTED', `job ${this.job_id} has no committed figures to amend`);
    }
    if (!input.reason || input.reason.trim().length === 0) {
      throw new QuarantineError(
        'E_NO_REASON',
        'a post-release amendment must state why. An unexplained change after seeing our estimate is ' +
          'indistinguishable from anchoring drift',
      );
    }
    const from = this.amendments.length ? this.amendments[this.amendments.length - 1].to : this.commitment.figures;
    const a: Amendment = { job_id: this.job_id, surveyor_id: input.surveyor_id, at: this.#clock(), from, to: input.to, reason: input.reason };
    this.amendments.push(a);
    this.#log.append({
      kind: 'POST_RELEASE_AMENDMENT', job_id: this.job_id, actor: input.surveyor_id, at: a.at,
      detail: { from, to: input.to, reason: input.reason },
    });
    return a;
  }

  /**
   * The surveyor self-reports that the client told them our figure. The system
   * cannot prevent this; it can record it, which is the honest position.
   */
  reportClientDisclosure(surveyor_id: string, note: string): void {
    this.anchor_exposed = true;
    this.#log.append({
      kind: 'CLIENT_DISCLOSURE_REPORTED', job_id: this.job_id, actor: surveyor_id, at: this.#clock(),
      detail: { note, state_at_disclosure: this.state },
    });
  }

  /** Final figures: the last amendment, or the commitment if none. */
  finalFigures(): SurveyorFigures | null {
    if (!this.commitment) return null;
    return this.amendments.length ? this.amendments[this.amendments.length - 1].to : this.commitment.figures;
  }

  /** Test-only escape hatch, used to build the drift report without opening the quarantine. */
  estimateHash(): string {
    return this.estimate_hash;
  }

  /** Deliberately package-private in spirit: only the drift calculator uses it, post-release. */
  estimateForAnalysis(): EstimateOutputs {
    if (this.state !== 'COMMITTED_AND_RELEASED') {
      throw new QuarantineError('E_QUARANTINED', 'the estimate is not available for analysis before release');
    }
    return this.#estimate;
  }
}

/* ------------------------------------------------------------------ *
 * 6. Anchoring drift — what the quarantine measures
 * ------------------------------------------------------------------ */

export type FieldDrift = {
  field: string;
  committed: number;
  final: number;
  estimate: number;
  /** final - committed. Zero where the surveyor did not move. */
  movement: number;
  /** Did the movement go toward our estimate? Null where there was no movement. */
  toward_estimate: boolean | null;
  /** How much of the original gap to our estimate was closed. 0..1, or null. */
  gap_closed: number | null;
};

export type DriftReport = {
  job_id: string;
  surveyor_id: string;
  anchor_exposed_before_commitment: boolean;
  amendments: number;
  fields: FieldDrift[];
  /** Fields that moved toward the estimate after release. The number worth watching. */
  moved_toward_estimate: number;
};

const DRIFT_FIELDS: { field: keyof SurveyorFigures; estimate: keyof EstimateOutputs }[] = [
  { field: 'A_qualifying_plant_pence', estimate: 'qualifying_expenditure_pence' },
  { field: 'C_bare_land_pence', estimate: 'bare_land_pence' },
  { field: 'qualifying_pct', estimate: 'qualifying_pct' },
];

export function driftReport(q: AnchorQuarantine): DriftReport {
  if (!q.commitment) throw new QuarantineError('E_NOT_COMMITTED', `job ${q.job_id} has no commitment to compare`);
  const est = q.estimateForAnalysis();
  const final = q.finalFigures()!;

  const fields: FieldDrift[] = DRIFT_FIELDS.map(({ field, estimate }) => {
    const committed = q.commitment!.figures[field];
    const f = final[field];
    const e = est[estimate] as number;
    const movement = f - committed;
    const originalGap = e - committed;
    const remainingGap = e - f;
    return {
      field,
      committed,
      final: f,
      estimate: e,
      movement,
      toward_estimate: movement === 0 ? null : Math.abs(remainingGap) < Math.abs(originalGap),
      gap_closed: movement === 0 || originalGap === 0 ? null : Math.round(((originalGap - remainingGap) / originalGap) * 1000) / 1000,
    };
  });

  return {
    job_id: q.job_id,
    surveyor_id: q.commitment.surveyor_id,
    anchor_exposed_before_commitment: false, // see below; set by the caller from the log
    amendments: q.amendments.length,
    fields,
    moved_toward_estimate: fields.filter((f) => f.toward_estimate === true).length,
  };
}

/* ------------------------------------------------------------------ *
 * 7. Process assurance — reading the log back
 * ------------------------------------------------------------------ */

export type ProcessAssurance = {
  job_id: string;
  chain_intact: boolean;
  quarantine_created: string | null;
  surveyor_assigned: string | null;
  committed: string | null;
  released: string | null;
  denied_attempts: number;
  viewed_before_release_by_surveyor: boolean;
  client_disclosures: number;
  /** The one-line answer to "was the process followed on this job". */
  verdict: 'CLEAN' | 'EXPOSED' | 'INCOMPLETE' | 'CHAIN_BROKEN';
};

export function assureProcess(log: AnchorLog, job_id: string): ProcessAssurance {
  const chain = log.verify();
  const es = log.of(job_id);
  const first = (k: LogKind) => es.find((e) => e.kind === k)?.at ?? null;

  const denied = es.filter((e) => e.kind === 'ACCESS_DENIED').length;
  const releasedAt = first('RELEASED');
  const viewedBefore = es.some(
    (e) => e.kind === 'ESTIMATE_VIEWED' && e.detail.role === 'SURVEYOR' && (!releasedAt || e.at < releasedAt),
  );
  const disclosures = es.filter((e) => e.kind === 'CLIENT_DISCLOSURE_REPORTED').length;

  const verdict: ProcessAssurance['verdict'] = !chain.intact
    ? 'CHAIN_BROKEN'
    : viewedBefore || disclosures > 0
      ? 'EXPOSED'
      : first('COMMITMENT_RECORDED') && releasedAt
        ? 'CLEAN'
        : 'INCOMPLETE';

  return {
    job_id,
    chain_intact: chain.intact,
    quarantine_created: first('QUARANTINE_CREATED'),
    surveyor_assigned: first('SURVEYOR_ASSIGNED'),
    committed: first('COMMITMENT_RECORDED'),
    released: releasedAt,
    denied_attempts: denied,
    viewed_before_release_by_surveyor: viewedBefore,
    client_disclosures: disclosures,
    verdict,
  };
}
