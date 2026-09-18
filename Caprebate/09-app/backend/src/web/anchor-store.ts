/**
 * THE ANCHOR QUARANTINE, MADE DURABLE — and nothing else.
 *
 * caprebate-anchor-quarantine.ts is the AUTHORITY on N1: what is quarantined,
 * when it is released, what the log records and how the chain is verified.
 * This file gives it somewhere to keep its log between requests and rebuilds a
 * quarantine object from what it kept. IT DECIDES NOTHING. There is no rule
 * here about who may see an estimate, no second release condition, and no
 * copy of the module's state machine.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHY `DbAnchorLog` EXTENDS `AnchorLog` RATHER THAN WRAPPING IT
 *
 * `AnchorQuarantine`'s constructor takes `log: AnchorLog` and calls `append`
 * on it four ways. A wrapper would have to be cast to that type, and a cast is
 * exactly the place a second implementation hides. Extending it and overriding
 * the four methods means the compiler checks the shape, and the parent's own
 * `#entries` array is simply never used.
 *
 * THE HASH IS NOT RE-INVENTED HERE, AND THIS IS THE LOAD-BEARING PART. The
 * scheme is sha256 over the canonical form of the entry plus the previous
 * hash, and `_canonical` in src/audit.ts is that canonicaliser — audit.ts
 * imports GENESIS from the quarantine module and there is already a test that
 * the two logs agree on a hash rather than merely looking alike. So this file
 * uses the same function, and then the module's OWN exported `verifyChain`
 * recomputes every row it wrote. If this file's chaining were wrong in any
 * way, `verifyChain` would report the chain broken — which is a real check on
 * a real disagreement, not a comment asserting the two agree.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * TWO KINDS ARE IDEMPOTENT, AND THAT IS A DESIGN DECISION
 *
 * `QUARANTINE_CREATED` and `ESTIMATE_SEALED` are appended by the quarantine's
 * CONSTRUCTOR. A quarantine object is constructed once per request — it holds
 * the estimate in a private field and there is no other way to hand it one —
 * so a naive durable log would grow two rows every time a surveyor refreshed
 * the page, and the log an auditor reads would be mostly noise.
 *
 * Both kinds are once-per-job BY MEANING: a job is created once and its
 * estimate is sealed once. So `append` returns the existing row for those two
 * kinds instead of writing a second. Nothing else is idempotent — an
 * ACCESS_DENIED, an ESTIMATE_VIEWED and an amendment are each their own event
 * and each is written every time, which is what makes the denied attempts
 * countable.
 */

import { createHash } from 'node:crypto';
import type { Db } from '../db.ts';
import { _canonical } from '../audit.ts';
import {
  AnchorLog, AnchorQuarantine, GENESIS, verifyChain,
  type Commitment, type EstimateOutputs, type LogEntry, type LogKind, type SurveyorFigures,
} from '../../../../04-phase-work/phase3/caprebate-anchor-quarantine.ts';

/** Once per job, by meaning. See the header. */
const ONCE_PER_JOB: readonly LogKind[] = Object.freeze(['QUARANTINE_CREATED', 'ESTIMATE_SEALED']);

type LogRow = {
  seq: number; kind: string; job_id: string; actor: string; at: string;
  detail_json: string; prev_hash: string; hash: string;
};

function toEntry(r: LogRow): LogEntry {
  return {
    seq: r.seq, kind: r.kind as LogKind, job_id: r.job_id, actor: r.actor, at: r.at,
    detail: JSON.parse(r.detail_json) as Record<string, unknown>,
    prev_hash: r.prev_hash, hash: r.hash,
  };
}

export class DbAnchorLog extends AnchorLog {
  readonly #db: Db;

  constructor(db: Db) {
    super();
    this.#db = db;
  }

  override append(e: Omit<LogEntry, 'seq' | 'prev_hash' | 'hash'>): LogEntry {
    if (ONCE_PER_JOB.includes(e.kind)) {
      const existing = this.#db.get<LogRow>(
        'SELECT * FROM anchor_log WHERE job_id = ? AND kind = ? ORDER BY seq ASC LIMIT 1',
        [e.job_id, e.kind],
      );
      if (existing !== undefined) return toEntry(existing);
    }

    const last = this.#db.get<{ hash: string }>('SELECT hash FROM anchor_log ORDER BY seq DESC LIMIT 1');
    const prev_hash = last ? last.hash : GENESIS;
    const seqRow = this.#db.get<{ n: number }>('SELECT COALESCE(MAX(seq),0) + 1 AS n FROM anchor_log');
    const seq = seqRow ? seqRow.n : 1;

    // The module's own body shape, field for field and in its own order — the
    // canonicaliser sorts keys, so order does not matter to the hash, but a
    // reader comparing the two files should not have to check that.
    const body = {
      seq, kind: e.kind, job_id: e.job_id, actor: e.actor, at: e.at,
      detail: e.detail, prev_hash,
    };
    const hash = createHash('sha256').update(_canonical(body)).digest('hex');

    this.#db.run(
      'INSERT INTO anchor_log (seq, kind, job_id, actor, at, detail_json, prev_hash, hash) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [seq, e.kind, e.job_id, e.actor, e.at, JSON.stringify(e.detail), prev_hash, hash],
    );
    return { ...body, hash };
  }

  override entries(): readonly LogEntry[] {
    return this.#db.all<LogRow>('SELECT * FROM anchor_log ORDER BY seq ASC').map(toEntry);
  }

  override of(job_id: string): readonly LogEntry[] {
    return this.#db
      .all<LogRow>('SELECT * FROM anchor_log WHERE job_id = ? ORDER BY seq ASC', [job_id])
      .map(toEntry);
  }

  /**
   * The module's own verifier, over the rows read back out of the database.
   * Not a reimplementation of it — the import is the point.
   */
  override verify(): { intact: boolean; broken_at: number | null } {
    return verifyChain(this.entries());
  }
}

export type StoredJob = {
  readonly job_id: string;
  readonly business_id: string;
  readonly assessment_id: string;
  readonly surveyor_id: string | null;
  readonly state: 'SEALED' | 'COMMITTED_AND_RELEASED';
};

/**
 * Rebuild the quarantine for a job.
 *
 * THE PUBLIC FIELDS ARE RESTORED DIRECTLY, AND THE METHODS ARE NOT REPLAYED.
 * `assignSurveyor` and `commit` are ACTIONS: each writes a log entry, and
 * calling them to reconstruct a state would append a second SURVEYOR_ASSIGNED
 * and a second COMMITMENT_RECORDED for something that happened last week. So
 * an action is called when it happens, and a rehydration sets the fields the
 * module already exposes as public.
 *
 * `anchor_exposed` IS RECOMPUTED FROM THE LOG rather than stored. The module
 * sets it when a quarantined viewer opens the estimate, and the log is where
 * that is recorded — a stored copy would be a second answer to a question the
 * log already answers, and the two would eventually disagree.
 */
export function hydrateQuarantine(
  db: Db, job: StoredJob, estimate: EstimateOutputs, clock: () => string, sealed_by: string,
): AnchorQuarantine {
  const log = new DbAnchorLog(db);
  const q = new AnchorQuarantine({ job_id: job.job_id, estimate, log, clock, sealed_by });

  q.surveyor_id = job.surveyor_id;
  q.state = job.state;

  const c = db.get<{
    surveyor_id: string; a_qualifying_plant_pence: number; b_building_pence: number;
    c_bare_land_pence: number; qualifying_pct: number; method_note: string;
    committed_at: string; figures_hash: string; released_at: string;
  }>('SELECT * FROM surveyor_commitments WHERE job_id = ?', [job.job_id]);

  if (c !== undefined) {
    const figures: SurveyorFigures = {
      A_qualifying_plant_pence: c.a_qualifying_plant_pence,
      B_building_pence: c.b_building_pence,
      C_bare_land_pence: c.c_bare_land_pence,
      qualifying_pct: c.qualifying_pct,
    };
    const commitment: Commitment = {
      job_id: job.job_id, surveyor_id: c.surveyor_id, figures,
      committed_at: c.committed_at, hash: c.figures_hash, method_note: c.method_note,
    };
    q.commitment = commitment;
    q.released_at = c.released_at;
  }

  q.anchor_exposed = log.of(job.job_id).some(
    (e) => e.kind === 'ESTIMATE_VIEWED' && e.detail['role'] === 'SURVEYOR',
  ) || log.of(job.job_id).some((e) => e.kind === 'CLIENT_DISCLOSURE_REPORTED');

  return q;
}

/** Persist what `AnchorQuarantine.commit` returned. It computed all of it. */
export function storeCommitment(
  db: Db, id: string, c: Commitment, released_at: string,
): void {
  db.run(
    'INSERT INTO surveyor_commitments (id, job_id, surveyor_id, a_qualifying_plant_pence, ' +
      'b_building_pence, c_bare_land_pence, qualifying_pct, method_note, committed_at, ' +
      'figures_hash, released_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, c.job_id, c.surveyor_id, c.figures.A_qualifying_plant_pence, c.figures.B_building_pence,
      c.figures.C_bare_land_pence, c.figures.qualifying_pct, c.method_note, c.committed_at,
      c.hash, released_at],
  );
  db.run(
    "UPDATE surveyor_jobs SET state = 'COMMITTED_AND_RELEASED', committed_at = ? WHERE id = ?",
    [c.committed_at, c.job_id],
  );
}
