/**
 * THE SURVEYOR'S REVIEW-AND-SIGN WORKSPACE — view models. Block F, part one.
 *
 * Routes and rendering are src/web/surveyor-pages.ts. Every function here
 * takes an ACTOR, authorises on the SPECIFIC job before it reads, and returns
 * what that actor may have — the same discipline as engaged.ts and portal.ts.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NON-NEGOTIABLE N1 IS THE WHOLE POINT OF THIS FILE, AND IT IS NOT ENFORCED
 * HERE
 *
 * Our estimate must not be in the data a surveyor's session receives. Not
 * hidden. Not greyed. NOT PRESENT IN THE RESPONSE. That rule belongs to
 * caprebate-anchor-quarantine.ts, and the assembler that obeys it is
 * src/payload.ts, which builds the surveyor's object FORWARDS from what is
 * released rather than reading everything and deleting. This file calls that
 * assembler and adds nothing to its output that came from the estimate.
 *
 * THE DIRECTION THAT FAILS SAFE, RESTATED BECAUSE IT IS EASY TO UNDO. A new
 * field added to the workspace is absent from the surveyor's payload by
 * default. A build-then-strip assembler is one forgotten key away from
 * leaking, and a developer who sees an estimate arrive and get hidden will
 * build exactly that. Every addition below goes through `assembleSurveyorPayload`
 * or is an INPUT — the room list, the client's own answers, the register data,
 * the documents — which the quarantine releases to a surveyor always.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT IS STUBBED, AND IT SAYS SO ON SCREEN
 *
 * THE SIGNATURE. There is no signature provider in this build — `src/stubs/
 * signature.ts` contacts nobody and executes nothing. So "sign off" here means
 * the surveyor COMMITS their figures with a method note, which is recorded,
 * hashed and timestamped and is the thing the anchor quarantine actually turns
 * on. It is not an executed document and the workspace does not pretend it is.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EVERY PAGE LOAD WRITES A LOG LINE, AND THAT IS THE MODULE WORKING
 *
 * Opening a sealed job as a surveyor writes an ACCESS_DENIED; opening one as
 * staff writes an ESTIMATE_VIEWED. So a surveyor who refreshes six times
 * leaves six denials in the anchor log, and that will look like noise to
 * whoever reads it first.
 *
 * IT IS NOT NOISE AND IT MUST NOT BE DE-DUPLICATED. The module's own comment
 * is that a denied attempt is "evidence in its own right", `assureProcess`
 * counts them, and the count is part of what makes the process assurance
 * evidential rather than assertable. A build that suppressed repeats would be
 * deciding which attempts to record, which is the one thing an append-only log
 * may not do. The log has one entry per attempt because there was one attempt.
 */

import type { Db } from '../db.ts';
import { authorise, can, type Actor, type Obj } from '../authz.ts';
import type { AuditLog } from '../audit.ts';
import { assembleSurveyorPayload, QUARANTINE_NOTICE, type JobInputs, type SurveyorPayload } from '../payload.ts';
import {
  assureProcess, driftReport, QuarantineError, RELEASED_TO_SURVEYOR_ALWAYS,
  type EstimateOutputs, type ProcessAssurance, type SurveyorFigures,
} from '../../../../04-phase-work/phase3/caprebate-anchor-quarantine.ts';
import {
  fieldSpec, propose, OverrideStore, RateLibrary, RATE_FIELDS,
  isBlankControl, ControlStore,
  CrmError, type Context, type PrefillEvent, type Proposal, type Sector,
} from '../../../../04-phase-work/phase3/caprebate-surveyor-crm.ts';
import { DbAnchorLog, hydrateQuarantine, storeCommitment, type StoredJob } from './anchor-store.ts';
import { roomsFor, SOURCE_DOCUMENT, type RoomType, type SectorRooms } from './rooms.ts';
import { missingFacts, NotFoundAsRefusal, type MissingFact } from './engaged.ts';
import { versionObj } from './documents.ts';
import { anyStageLabel, stage as stageOf } from './stages.ts';
/* Phase 110. The region a rate library entry is keyed on. resolveProperty
   never throws and never guesses — see the comment on REGION_NOT_CAPTURED. */
import { resolveProperty } from './postcode.ts';

export { NotFoundAsRefusal };

/**
 * THE SECTION GATE. `surveyor_job.enter` — its own action rather than a
 * sentinel object, and authz.ts says at length why this one collection cannot
 * use the sentinel the other three use.
 *
 * The object's `surveyor_id` is null because no rule for this action reads it:
 * all three admitted roles are unconditional. A sentinel carrying the
 * requester's own id would be a fixture built to pass the test being asked.
 */
const SURVEY_SECTION = '__surveyor_jobs__';

export function assertSurveySection(actor: Actor): void {
  authorise(actor, 'surveyor_job.enter', {
    type: 'surveyor_job', id: SURVEY_SECTION, business_id: SURVEY_SECTION, surveyor_id: null,
  });
}

/* ================================================================== *
 * THE JOB
 * ================================================================== */

export type JobRow = {
  readonly job_id: string;
  readonly business_id: string;
  readonly business_name: string;
  readonly sector: string;
  readonly assessment_id: string;
  readonly surveyor_id: string | null;
  readonly surveyor_name: string | null;
  readonly state: 'SEALED' | 'COMMITTED_AND_RELEASED';
  readonly committed_at: string | null;
  readonly created_at: string;
  readonly stage_label: string;
  /** Room types counted, out of how many the sector's schedule has. */
  readonly rooms_counted: number;
  readonly rooms_total: number;
  /** Rate fields the surveyor has recorded a figure for, out of the ten tracked. */
  readonly rates_recorded: number;
  readonly rates_total: number;
  /** UI TIDY PHASE 10: the job's own claim — its number, its site and its stage — so two jobs for one client are told
   *  apart. Null for a job on no claim. The site is the property's label; the surveyor's payload already carries it. */
  readonly claim_id: string | null;
  readonly claim_ref: string | null;
  readonly property_label: string | null;
  readonly property_postcode: string | null;
  readonly claim_stage_key: string | null;
};

type JobDbRow = {
  id: string; business_id: string; assessment_id: string; surveyor_id: string | null;
  state: string; committed_at: string | null; created_at: string;
  name: string; sector: string; stage: string; surveyor_name: string | null;
  /** The CRM follow-on: the stage of the job's own claim, in the operating procedure's words. NULL for a job on no claim. */
  claim_id: string | null; claim_stage: string | null;
  claim_ref: string | null; property_label: string | null; property_postcode: string | null;
};

const JOB_SELECT =
  'SELECT j.id, j.business_id, j.assessment_id, j.surveyor_id, j.state, j.committed_at, ' +
  'j.created_at, b.name, b.sector, b.stage, u.display_name AS surveyor_name, j.claim_id, cl.stage AS claim_stage, ' +
  'cl.claim_ref, p.label AS property_label, p.postcode AS property_postcode ' +
  'FROM surveyor_jobs j JOIN businesses b ON b.id = j.business_id ' +
  'LEFT JOIN users u ON u.id = j.surveyor_id LEFT JOIN claims cl ON cl.id = j.claim_id ' +
  'LEFT JOIN properties p ON p.id = cl.property_id ';

function objOf(r: JobDbRow): Extract<Obj, { type: 'surveyor_job' }> {
  return { type: 'surveyor_job', id: r.id, business_id: r.business_id, surveyor_id: r.surveyor_id };
}

function toRow(db: Db, r: JobDbRow): JobRow {
  const schedule = roomsFor(r.sector);
  const total = schedule === null ? 0 : schedule.rooms.length;
  const counted = db.get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM surveyor_room_counts WHERE job_id = ? AND room_count IS NOT NULL',
    [r.id],
  )?.n ?? 0;
  const rates = db.get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM surveyor_rate_events WHERE job_id = ?', [r.id],
  )?.n ?? 0;
  return {
    job_id: r.id, business_id: r.business_id, business_name: r.name, sector: r.sector,
    assessment_id: r.assessment_id, surveyor_id: r.surveyor_id, surveyor_name: r.surveyor_name,
    state: r.state as JobRow['state'], committed_at: r.committed_at, created_at: r.created_at,
    // THE CRM FOLLOW-ON: THE CLAIM'S STAGE, IN THE PROCEDURE'S WORDS. This read the organisation's six-key stage, whose
    // labels are the client portal's — so a claim at SURVEY read as the portal tells a client. A job on no claim falls
    // back to that stage and says so; an unknown stage is still not stage zero.
    stage_label: r.claim_id !== null
      ? anyStageLabel(r.claim_stage)
      : `${stageOf(r.stage)?.label ?? 'stage unknown'} — not yet on a claim`,
    rooms_counted: counted, rooms_total: total,
    rates_recorded: rates, rates_total: RATE_FIELDS.length,
    claim_id: r.claim_id, claim_ref: r.claim_ref, property_label: r.property_label, property_postcode: r.property_postcode,
    claim_stage_key: r.claim_stage,
  };
}

/**
 * The jobs this actor may open.
 *
 * AUTHORISED ONE ROW AT A TIME, which for a surveyor means the assigned-jobs
 * filter is the RULE rather than a WHERE clause. An unassigned job is nobody's
 * — `assignedSurveyor` says so — and a query that filtered on
 * `surveyor_id = ?` would give the same answer today by a different mechanism,
 * which is the mechanism that stops agreeing with the rule table the first
 * time the rule changes.
 */
export function surveyorJobs(db: Db, actor: Actor, limit = 200): JobRow[] {
  assertSurveySection(actor);
  const rows = db.all<JobDbRow>(`${JOB_SELECT}ORDER BY j.created_at DESC LIMIT ?`, [limit]);
  return rows.filter((r) => can(actor, 'surveyor_job.read', objOf(r))).map((r) => toRow(db, r));
}

function loadJob(db: Db, actor: Actor, job_id: string): JobDbRow {
  const r = db.get<JobDbRow>(`${JOB_SELECT}WHERE j.id = ?`, [job_id]);
  if (r === undefined) throw new NotFoundAsRefusal();
  authorise(actor, 'surveyor_job.read', objOf(r));
  return r;
}

/**
 * 1 Oct 2026: THE JOB, FOR THE SURVEY PACK (src/web/survey-pack.ts) — read under the same rule as the workspace
 * (`surveyor_job.read` on the specific job), and its authorisation object, so the pack asks `surveyor_job.commit` of the
 * same object the workspace does. Nothing else of the job is handed out.
 */
export type PackJob = {
  readonly id: string; readonly business_id: string; readonly business_name: string; readonly sector: string;
  readonly surveyor_id: string | null; readonly surveyor_name: string | null; readonly claim_id: string | null;
  readonly state: string;
};
/** 2 Oct 2026: whether a job has its locked estimate — without one, committing figures releases nothing and is refused. */
export function jobHasEstimate(db: Db, job_id: string): boolean {
  return db.get('SELECT 1 AS x FROM estimates e JOIN surveyor_jobs j ON j.assessment_id = e.assessment_id WHERE j.id = ?', [job_id]) !== undefined;
}

export function packJob(db: Db, actor: Actor, job_id: string): { job: PackJob; obj: Extract<Obj, { type: 'surveyor_job' }> } {
  const r = loadJob(db, actor, job_id);
  return {
    job: { id: r.id, business_id: r.business_id, business_name: r.name, sector: r.sector, surveyor_id: r.surveyor_id,
      surveyor_name: r.surveyor_name, claim_id: r.claim_id, state: r.state },
    obj: objOf(r),
  };
}

/* ================================================================== *
 * THE PAYLOAD — the inputs, and no outputs
 * ================================================================== */

/** The sealed estimate for a job. Read ONLY to hand to the quarantine. */
function sealedEstimate(db: Db, assessment_id: string): EstimateOutputs | null {
  const e = db.get<{
    qualifying_expenditure_pence: number; qualifying_pct: number;
    pool_split_main_pence: number; pool_split_special_pence: number;
    bare_land_pence: number; multiplier: number; indicative_lifetime_saving_pence: number;
  }>('SELECT * FROM estimates WHERE assessment_id = ?', [assessment_id]);
  if (e === undefined) return null;
  return {
    qualifying_expenditure_pence: e.qualifying_expenditure_pence,
    qualifying_pct: e.qualifying_pct,
    pool_split_main_pence: e.pool_split_main_pence,
    pool_split_special_pence: e.pool_split_special_pence,
    bare_land_pence: e.bare_land_pence,
    multiplier: e.multiplier,
    indicative_lifetime_saving_pence: e.indicative_lifetime_saving_pence,
  };
}

/**
 * The inputs a survey needs, in the shape payload.ts declares.
 *
 * EVERY FIELD HERE IS ON `RELEASED_TO_SURVEYOR_ALWAYS`. The client's answers,
 * the register data, the property and its postcode. Withholding them would
 * degrade the work without protecting anything — what anchors is our NUMBER,
 * and nothing in this function can reach it.
 */
function inputsFor(db: Db, r: JobDbRow): JobInputs {
  return {
    job_id: r.id,
    business_id: r.business_id,
    business_name: r.name,
    sector: r.sector,
    answers: db.all<{ ord: number; question_id: string; question_text: string; state: string; value: string | null }>(
      'SELECT ord, question_id, question_text, state, value FROM assessment_answers ' +
        'WHERE assessment_id = ? ORDER BY ord ASC', [r.assessment_id],
    ),
    register_records: db.all<{ source_id: string; fields_json: string }>(
      'SELECT source_id, fields_json FROM register_records WHERE business_id = ? ORDER BY source_id ASC',
      [r.business_id],
    ).map((x) => ({ source_id: x.source_id, fields: withoutAmounts(x.source_id, safeParse(x.fields_json)) })),
    properties: db.all<{ label: string; postcode: string | null }>(
      'SELECT label, postcode FROM properties WHERE business_id = ? ORDER BY label ASC', [r.business_id],
    ),
  };
}

/**
 * PHASE 146c: A PRICE A REGISTER GIVES IS NOT A SURVEYOR'S INPUT. Before this phase no register could give one; the sale
 * price lookup (HM Land Registry's Price Paid Data) now can. "An amount agreed between buyer and seller is a number a
 * surveyor could anchor on as readily as our own, so it waits with our estimate" — the rule CRM 6 wrote for the claim's
 * facts (RELEASED_FACTS_TO_SURVEYOR in src/payload.ts), applied here to the register records the same way: the field
 * is left out of the surveyor's job, never read into it. The rest of the record — the date, the tenure — still goes.
 */
export const REGISTER_AMOUNTS_WITHHELD: Readonly<Record<string, readonly string[]>> = Object.freeze({
  HMLR_PPD: Object.freeze(['price_paid']),
  /* PHASE 146d: THE TITLE REGISTER'S PRICE IS THE SAME KIND OF NUMBER AND WAITS THE SAME WAY. An official copy
     records the price paid, or the value stated where no price was paid, and either is an amount agreed between a
     buyer and a seller — a number a surveyor could anchor on as readily as our own. It is left out of the
     surveyor's job; the tenure, the dates and the title number still go. This matters MORE here than it does for
     the free sale-price lookup, not less: this is the source that carries a price for COMMERCIAL property, which
     is the four sectors a surveyor is most often valuing. */
  HMLR_TITLE: Object.freeze(['price_paid']),
});

function withoutAmounts(source_id: string, fields: unknown): unknown {
  const drop = REGISTER_AMOUNTS_WITHHELD[source_id];
  if (drop === undefined || fields === null || typeof fields !== 'object') return fields;
  return Object.fromEntries(Object.entries(fields as Record<string, unknown>).filter(([k]) => !drop.includes(k)));
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s) as unknown; } catch { return {}; }
}

export type Deps = { db: Db; audit: AuditLog; now: () => string; newId: () => string };

/**
 * THE SURVEYOR'S PAYLOAD FOR ONE JOB — the object a session actually receives.
 *
 * This is what `/staff/survey/<job>/payload.json` serves and what the workspace
 * page is rendered from, and they are THE SAME OBJECT rather than two
 * assemblies of the same idea. A page built from a second, richer object would
 * make the JSON endpoint a demonstration rather than a proof.
 *
 * A JOB WITH NO SEALED ESTIMATE STILL RETURNS A PAYLOAD. `estimates` is
 * written when the assessment is submitted, and a job created before then has
 * nothing to quarantine — which is not an error, it is a job whose estimate
 * has not been sealed. The state is reported as such and the survey can
 * proceed: the inputs are all there.
 */
export function payloadFor(d: Deps, actor: Actor, job_id: string): SurveyorPayload {
  const r = loadJob(d.db, actor, job_id);
  const est = sealedEstimate(d.db, r.assessment_id);
  const inputs = inputsFor(d.db, r);

  if (est === null) {
    return {
      ...inputs,
      quarantine: {
        state: r.state as 'SEALED' | 'COMMITTED_AND_RELEASED',
        notice:
          'This job has no locked estimate, so there is nothing to hold back or release. ' +
          'Your figures are still saved the same way.',
        released_always: RELEASED_TO_SURVEYOR_ALWAYS,
      },
    };
  }

  const q = hydrateQuarantine(d.db, storedJob(r), est, d.now, 'system');
  return assembleSurveyorPayload(actor, inputs, q);
}

function storedJob(r: JobDbRow): StoredJob {
  return {
    job_id: r.id, business_id: r.business_id, assessment_id: r.assessment_id,
    surveyor_id: r.surveyor_id, state: r.state as StoredJob['state'],
  };
}

/* ================================================================== *
 * THE QUANTITIES
 * ================================================================== */

export type RoomRow = RoomType & {
  /** NULL means nobody has counted it. Never 0 by default — see migration 006. */
  readonly count: number | null;
  readonly note: string | null;
  readonly recorded_at: string | null;
};

export type RoomSchedule = {
  readonly schedule: SectorRooms | null;
  readonly rows: readonly RoomRow[];
  readonly counted: number;
  readonly uncounted: number;
  readonly source: string;
};

export function roomSchedule(db: Db, actor: Actor, job_id: string): RoomSchedule {
  const r = loadJob(db, actor, job_id);
  const schedule = roomsFor(r.sector);
  if (schedule === null) {
    return { schedule: null, rows: [], counted: 0, uncounted: 0, source: SOURCE_DOCUMENT };
  }
  const stored = new Map(
    db.all<{ room_id: string; room_count: number | null; note: string | null; recorded_at: string }>(
      'SELECT room_id, room_count, note, recorded_at FROM surveyor_room_counts WHERE job_id = ?',
      [job_id],
    ).map((x) => [x.room_id, x] as const),
  );
  const rows: RoomRow[] = schedule.rooms.map((room) => {
    const s = stored.get(room.room_id);
    return {
      ...room,
      count: s?.room_count ?? null,
      note: s?.note ?? null,
      recorded_at: s?.recorded_at ?? null,
    };
  });
  const counted = rows.filter((x) => x.count !== null).length;
  return {
    schedule, rows, counted, uncounted: rows.length - counted, source: SOURCE_DOCUMENT,
  };
}

/** PHASE 133e (D4, continued): `field` is the posted name a refusal is about, where it is about one. A refusal
 *  about the job's own state — already committed, no sealed estimate — is about no one field and carries none. */
export type SaveResult = { ok: true } | { ok: false; why: string; field?: string };

/**
 * Record one room count.
 *
 * AN EMPTY BOX CLEARS THE COUNT BACK TO UNKNOWN rather than writing a nought.
 * A surveyor who deletes a number they entered by mistake means "I have not
 * counted this", and storing 0 would mean "there are none of these", which is
 * a different survey finding. The two states are distinct in the schema for
 * exactly this and the form has a separate "none" answer for the second.
 */
export function saveRoomCount(
  d: Deps, actor: Actor, job_id: string,
  input: { room_id: string; count: string; note: string },
): SaveResult {
  const r = loadJob(d.db, actor, job_id);
  authorise(actor, 'surveyor_job.commit', objOf(r));

  const schedule = roomsFor(r.sector);
  const known = schedule !== null && schedule.rooms.some((x) => x.room_id === input.room_id);
  if (!known) return { ok: false, why: 'That is not a room type on this sector’s schedule.', field: 'room_id' };

  const raw = input.count.trim();
  let count: number | null = null;
  if (raw !== '') {
    if (!/^\d{1,6}$/.test(raw)) {
      return { ok: false, why: 'A count is a whole number, or leave it empty if you have not counted it yet.', field: 'count' };
    }
    count = Number(raw);
  }
  const note = input.note.trim() === '' ? null : input.note.trim();

  d.db.run(
    'INSERT INTO surveyor_room_counts (id, job_id, room_id, room_count, note, recorded_by, recorded_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (job_id, room_id) DO UPDATE SET ' +
      'room_count = excluded.room_count, note = excluded.note, ' +
      'recorded_by = excluded.recorded_by, recorded_at = excluded.recorded_at',
    [d.newId(), job_id, input.room_id, count, note, actor.id, d.now()],
  );
  return { ok: true };
}

/* ================================================================== *
 * THE RATE LIBRARY — theirs, not ours
 * ================================================================== */

/**
 * NO PLATFORM DEFAULTS EXIST IN THIS BUILD, AND THAT IS A FINDING RATHER THAN
 * A GAP IN THIS PHASE.
 *
 * `propose` takes a `PlatformDefaults` function: given a field and a context it
 * returns our own starting figure, or null. Ours returns null for everything,
 * because THERE IS NO PUBLISHED DEFAULT RATE SET ON DISK to read one from —
 * the price books this project holds cover neither dental nor care homes, and
 * inventing a qualifying percentage for a sector would be this application
 * making a valuation judgement on a building nobody has stood in.
 *
 * WHAT THAT MEANS, SAID PLAINLY RATHER THAN LEFT TO BE NOTICED. A surveyor's
 * FIRST job in a sector and region shows empty fields; their second shows
 * their own figures back, labelled as theirs. The calibration metric the CRM
 * exists for measures adoption of PLATFORM_DEFAULT pre-fills only, so with no
 * defaults it has nothing to measure and correctly reports nothing — rather
 * than reporting a flattering number computed over the surveyor's own figures,
 * which is the failure `CALIBRATION_ORIGIN` was written to prevent.
 */
export function platformDefaults(): number | null {
  return null;
}

export const NO_PLATFORM_DEFAULTS =
  'We have no default rate for this field in this sector. Our price books do not cover dental ' +
  'practices or care homes. A made-up number would be worse than an empty box — you would ' +
  'check our guess instead of making your own.';

/**
 * The ten tracked field ids, from the module.
 *
 * EXPORTED SO THE FORM READER ITERATES THE MODULE'S LIST rather than the
 * submitted keys. A handler that walked what a request contained would hand
 * `fieldSpec` whatever somebody posted; iterating this means an unrecognised
 * parameter is never read at all.
 */
export const RATE_FIELD_IDS: readonly string[] = Object.freeze(RATE_FIELDS.map((f) => f.field_id));

export type RateRow = {
  readonly field_id: string;
  readonly unit: string;
  readonly materiality: number;
  readonly consequence: string;
  /** What we would pre-fill, and whose figure it is. Null where we have neither — AND ON A BLANK CONTROL. */
  readonly proposal: Proposal | null;
  /**
   * PHASE 132. True where `isBlankControl(job, field)` puts this field in the
   * control arm on this job: it is shown EMPTY, whatever we or the surveyor's own
   * library would otherwise have proposed. Deterministic, so a reload serves the
   * same arm.
   */
  readonly blank_control: boolean;
  /** What this surveyor entered on THIS job, if anything yet. */
  readonly recorded: { readonly value: number; readonly outcome: string; readonly reason: string | null } | null;
};

/** Rebuild the CRM's library by replaying this surveyor's own events through it. */
function libraryFor(db: Db, surveyor_id: string): RateLibrary {
  const lib = new RateLibrary();
  for (const e of eventsOf(db, surveyor_id)) {
    /**
     * MIRRORS `RateLibrary.learn`'s OWN GUARD, and the mirror has to be kept
     * in step — Phase 107a is the second time it has mattered.
     *
     * The module refuses an UNTOUCHED event unless the figure is the
     * surveyor's own, which since Phase 107a means SURVEYOR_LIBRARY or
     * NOTHING_PROPOSED. Skipping the refused ones here rather than catching
     * the exception is deliberate: a caught exception in a rebuild loop hides
     * the day the rule changes. THE COST OF THAT CHOICE is that this line
     * restates the rule, and when Phase 107a widened the module's guard this
     * line still had the old one — so every first figure a surveyor entered
     * was learned by the module and then dropped here, and the library still
     * looked empty. The suite caught it; nothing else would have.
     */
    const theirOwn = e.prefill_origin === 'SURVEYOR_LIBRARY' || e.prefill_origin === 'NOTHING_PROPOSED';
    if (e.outcome === 'UNTOUCHED' && !theirOwn) continue;
    lib.learn(e);
  }
  return lib;
}

/**
 * PHASE 107a DELETED A FALLBACK THAT USED TO SIT HERE, and the reason is worth
 * keeping because the fallback's own comment was the specification for the fix.
 *
 * `RateLibrary.learn` refuses an UNTOUCHED event unless the figure is the
 * surveyor's own — rightly, because learning our own default back as "theirs"
 * would launder a platform default into a surveyor library and destroy the
 * stratification the whole adoption metric rests on. But `PrefillOrigin` had no
 * value meaning "we proposed nothing", and this build has no platform defaults
 * at all, so a surveyor's FIRST figure in a sector could only be recorded as
 * PLATFORM_DEFAULT + UNTOUCHED — false, and refused. THE LIBRARY COULD NEVER
 * ACQUIRE A FIRST ENTRY, so nobody's figures ever came back to them.
 *
 * Phase 107 answered that one case here, in application code, and said in terms
 * that the module was the right place for it. Phase 107a added
 * `NOTHING_PROPOSED` to the module, worked out what all five metrics do with it
 * (they exclude it by construction, and `adoption` now counts it on its own
 * line), and the call site below is `propose` again with nothing wrapped round
 * it. There is no second proposal path in this application.
 */

/** Every stored event for a surveyor, oldest first, as the module's own type. */
function eventsOf(db: Db, surveyor_id: string): PrefillEvent[] {
  return db.all<{
    job_id: string; surveyor_id: string; field_id: string; sector: string; region: string;
    prefilled_value: number; prefill_origin: string; final_value: number; outcome: string;
    relative_delta: number; reason: string | null; at: string; anchor_verdict: string;
  }>('SELECT * FROM surveyor_rate_events WHERE surveyor_id = ? ORDER BY at ASC, id ASC', [surveyor_id])
    .map((x) => ({
      job_id: x.job_id, surveyor_id: x.surveyor_id, field_id: x.field_id,
      context: { sector: x.sector as Sector, region: x.region },
      prefilled_value: x.prefilled_value,
      prefill_origin: x.prefill_origin as PrefillEvent['prefill_origin'],
      final_value: x.final_value, outcome: x.outcome as PrefillEvent['outcome'],
      relative_delta: x.relative_delta, reason: x.reason, at: x.at,
      anchor_verdict: x.anchor_verdict as PrefillEvent['anchor_verdict'],
    }));
}

/**
 * THE ENGINE'S SECTOR IDS AND THE CRM'S ARE TWO VOCABULARIES, AND THIS IS THE
 * ONE PLACE THEY MEET — the same pattern as roles.ts and `REGISTRY_ID_OF`, for
 * the same reason. The CRM predates the funnel's ids and uses upper-case
 * names; `gp` and `private_hospital` are the two that are not a simple
 * upper-casing.
 */
const CRM_SECTOR: Readonly<Record<string, Sector>> = Object.freeze({
  care_homes: 'CARE_HOMES',
  dental: 'DENTAL',
  supported_living: 'SUPPORTED_LIVING',
  gp: 'GP_PRIMARY_CARE',
  private_hospital: 'PRIVATE_HOSPITALS',
});

/**
 * THE REGION NOW COMES FROM THE PROPERTY'S POSTCODE. Phase 110, board item
 * 13004035199 job 3.
 *
 * A rate library entry is keyed on surveyor, field, sector AND region, because
 * a figure that is right in one part of the country is not automatically right
 * in another. Until 9 September 2026 nothing in this system had a region to
 * give it, every entry was keyed on the constant below, and a surveyor's own
 * figures were proposed back to them ACROSS THE WHOLE COUNTRY.
 *
 * WHAT CHANGED, AND WHAT DID NOT. `caprebate-region.ts` maps the council area
 * the postcode resolver returns to one of the THIRTEEN regions the price book
 * uses — the vocabulary this project already had, rather than a third one.
 * The CONSTANT STAYS as the answer when a region cannot be derived, and it is
 * still exported under this name so a `region` column can be searched for it.
 *
 * IT IS STILL THE ANSWER TODAY, ON EVERY DEPLOYMENT, and saying so is more
 * useful than the change: the postcode table is a 75 MB deployment artefact
 * that nobody has built yet, so `postcodeStore()` returns null and every
 * region is undERIVED. What is different is that the screen can now say WHICH
 * of the four things is missing — no postcode, no table, outside our
 * coverage, or the open Inner-London question — instead of printing
 * "region-not-captured" and leaving a surveyor to guess.
 *
 * A silent default of "London" would still look like data. It is still not
 * there.
 */
export { REGION_NOT_CAPTURED } from './postcode-port.ts';

/**
 * The rate library's context for a job.
 *
 * `postcode` is the property's, or null. NULL IS AN ORDINARY ARGUMENT, not an
 * error: most jobs have no postcode recorded and all of them worked that way
 * until today.
 */
export function contextFor(
  sector: string,
  postcode: string | null = null,
): Context | null {
  const s = CRM_SECTOR[sector];
  if (s === undefined) return null;
  return { sector: s, region: resolveProperty(postcode).region };
}

/**
 * The same lookup, with the REASON attached, for the screen. Kept separate
 * from `contextFor` so that a caller wanting a key cannot accidentally render
 * a reason as one, or vice versa.
 */
export function regionContextFor(
  sector: string,
  postcode: string | null = null,
): { readonly region: string; readonly derived: boolean; readonly why: string } {
  const r = resolveProperty(postcode);
  return { region: r.region, derived: r.region_derived, why: r.why };
}

export function rateLibrary(db: Db, actor: Actor, job_id: string): {
  readonly rows: readonly RateRow[];
  readonly context: Context | null;
  readonly region_derived: boolean;
  readonly region_why: string;
  readonly no_defaults: string;
} {
  const r = loadJob(db, actor, job_id);
  /* THE FIRST PROPERTY, and only the first. A business with sites in two
     regions is a real case and it is NOT handled here: keying a rate library
     on one of several regions would be a quiet wrong answer, so the multi-
     property case is the open question rather than an average. Ordered by
     label so the choice is at least stable between requests. */
  const property = db.get<{ postcode: string | null }>(
    'SELECT postcode FROM properties WHERE business_id = ? ORDER BY label ASC LIMIT 1',
    [r.business_id],
  );
  const postcode = property?.postcode ?? null;
  const context = contextFor(r.sector, postcode);
  const region_note = regionContextFor(r.sector, postcode);
  const surveyor = r.surveyor_id;

  const recorded = new Map(
    db.all<{ field_id: string; final_value: number; outcome: string; reason: string | null }>(
      'SELECT field_id, final_value, outcome, reason FROM surveyor_rate_events WHERE job_id = ?',
      [job_id],
    ).map((x) => [x.field_id, x] as const),
  );

  const lib = surveyor === null ? new RateLibrary() : libraryFor(db, surveyor);
  const now = r.committed_at ?? new Date().toISOString();

  const rows: RateRow[] = RATE_FIELDS.map((f) => {
    const got = recorded.get(f.field_id);
    /**
     * THE BLANK-FIELD CONTROL, SERVED. Phase 132, 14 September 2026 — calibration
     * instrument open item O-2.
     *
     * ONE FIELD IN TEN, PER JOB, IS SHOWN WITH NOTHING IN IT, and the module decides
     * which: `isBlankControl` is FNV-1a over `job_id::field_id`, so the same job is in
     * the same arm on every request and the arm can be reconstructed from the job id
     * when the data is audited. A random draw here would be unreconstructable, and an
     * unreconstructable control arm is not a control.
     *
     * THE PROPOSAL IS FORCED TO NULL, INCLUDING THE SURVEYOR'S OWN LIBRARY FIGURE.
     * The control measures where an UNANCHORED surveyor lands; their own earlier
     * figure is an anchor too, so it is withheld on a control field exactly as a
     * platform default would be. It is not lost — it is offered again on the next
     * job where this field is not a control.
     *
     * BUILT LIVE, NOT SWITCHED OFF. It changes no client's figure, and a switch would
     * defeat the one requirement it has: it must be running on the first job, because
     * it cannot be retrofitted onto jobs that were already shown a pre-fill.
     */
    const blank = isBlankControl(job_id, f.field_id);
    return {
      field_id: f.field_id, unit: f.unit, materiality: f.materiality, consequence: f.consequence,
      proposal: blank || surveyor === null || context === null
        ? null
        : propose(lib, platformDefaults, surveyor, f.field_id, context, now),
      blank_control: blank,
      recorded: got === undefined
        ? null
        : { value: got.final_value, outcome: got.outcome, reason: got.reason },
    };
  });

  return {
    rows, context,
    region_derived: region_note.derived,
    region_why: region_note.why,
    no_defaults: NO_PLATFORM_DEFAULTS,
  };
}

/* ================================================================== *
 * THE COMMITMENT — and the release it causes
 * ================================================================== */

export type RateInput = {
  readonly field_id: string;
  /** Empty string means "not answered". It is not zero. */
  readonly value: string;
  readonly reason: string;
  /** The positive confirmation the CRM says cannot be inferred after the fact. */
  readonly reviewed: boolean;
};

export type CommitInput = {
  readonly a_qualifying_plant: string;
  readonly b_building: string;
  readonly c_bare_land: string;
  readonly qualifying_pct: string;
  readonly method_note: string;
  readonly rates: readonly RateInput[];
};

export type CommitResult =
  | { ok: true; released_at: string }
  /** PHASE 133e (D4, continued): `field` is the posted name a refusal is about, where it is about one. */
  | { ok: false; why: string; field?: string };

/** Pence from a pounds figure typed by a person. Refuses anything else. */
function pence(raw: string): number | null {
  const s = raw.trim().replace(/[£,\s]/g, '');
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/** A percentage typed as 0-100, held as the module's 0-1 fraction. */
function fraction(raw: string): number | null {
  const s = raw.trim().replace(/[%\s]/g, '');
  if (!/^\d{1,3}(\.\d{1,4})?$/.test(s)) return null;
  const n = Number(s);
  return n >= 0 && n <= 100 ? n / 100 : null;
}

/**
 * The surveyor commits their own figures, and the estimate is released.
 *
 * THE RELEASE IS NOT A SEPARATE STEP AND THERE IS NO ROUTE THAT PERFORMS ONE.
 * `AnchorQuarantine.commit` records the commitment and releases in the same
 * call, so there is nobody to ask for early access — that is the module's
 * design and this function's job is to not undermine it. Look for a
 * `release()` in this file and there is none, deliberately.
 *
 * THE RATE EVENTS ARE WRITTEN IN THE SAME TRANSACTION AS THE COMMITMENT, and
 * their `anchor_verdict` is read off the log AFTER the commit, because the
 * verdict is exactly the question of whether this surveyor had seen our
 * estimate before committing. Recording them first would stamp every event
 * INCOMPLETE and quietly exclude the whole job from calibration.
 */
export function commitFigures(
  d: Deps, actor: Actor, job_id: string, input: CommitInput,
): CommitResult {
  const r = loadJob(d.db, actor, job_id);
  authorise(actor, 'surveyor_job.commit', objOf(r));

  if (r.state !== 'SEALED') {
    return { ok: false, why: 'These figures have already been committed. Amend them instead.' };
  }

  const a = pence(input.a_qualifying_plant);
  const b = pence(input.b_building);
  const c = pence(input.c_bare_land);
  const pct = fraction(input.qualifying_pct);
  if (a === null || b === null || c === null) {
    return { ok: false, why: 'The three amounts are figures in pounds, for example 250000 or 250000.00.',
      field: a === null ? 'a_qualifying_plant' : b === null ? 'b_building' : 'c_bare_land' };
  }
  if (pct === null) return { ok: false, why: 'The qualifying percentage is a number between 0 and 100.', field: 'qualifying_pct' };
  if (input.method_note.trim() === '') {
    return { ok: false, why: 'Say on what basis you reached these. Without a method, your figures are not evidence.', field: 'basis' };
  }

  const est = sealedEstimate(d.db, r.assessment_id);
  if (est === null) {
    return {
      ok: false,
      why: 'This job has no locked estimate, so committing would release nothing. ' +
        'Tell the office — do not work around it.',
    };
  }

  const figures: SurveyorFigures = {
    A_qualifying_plant_pence: a, B_building_pence: b, C_bare_land_pence: c, qualifying_pct: pct,
  };

  const q = hydrateQuarantine(d.db, storedJob(r), est, d.now, 'system');

  try {
    return d.db.tx((): CommitResult => {
      const commitment = q.commit({
        surveyor_id: actor.id, figures, method_note: input.method_note.trim(),
      });
      const released_at = q.released_at ?? commitment.committed_at;
      storeCommitment(d.db, d.newId(), commitment, released_at);

      const verdict = assureProcess(new DbAnchorLog(d.db), job_id).verdict;
      recordRates(d, actor, r, input.rates, verdict, 'COMMIT');

      d.audit.append({
        at: d.now(), kind: 'SURVEYOR_COMMITTED', actor_id: actor.id, actor_role: actor.role,
        object_type: 'surveyor_job', object_id: job_id, outcome: 'ALLOWED',
        detail: {
          released_at, anchor_verdict: verdict, figures_hash: commitment.hash,
          // The HASH, never the figures. Same rule the quarantine's own log
          // keeps for the estimate: a log that leaks what it is protecting is
          // not a log, it is a copy.
        },
      });
      return { ok: true, released_at };
    });
  } catch (e) {
    if (e instanceof QuarantineError) return { ok: false, why: e.message };
    if (e instanceof CrmError) return { ok: false, why: e.message };
    throw e;
  }
}

/**
 * The rate fields the surveyor filled in, through the CRM's own classifier.
 *
 * `classifyOutcome` DECIDES ADJUSTED FROM REPLACED, not this file: the split
 * turns on the field's materiality, and "nudged by 2%" and "halved" are
 * different pieces of evidence about the same pre-fill.
 *
 * A REASON IS REQUIRED AT OR ABOVE MATERIALITY AND NOT BELOW, which is the
 * module's rule and its reason is worth keeping in view: a mandatory note on
 * every 1% nudge trains people to type "n/a", which destroys the data the note
 * exists to capture.
 *
 * WITH NO PLATFORM DEFAULT THERE IS NO PRE-FILL, so `prefilled_value` is the
 * surveyor's own library figure where they have one and their own new figure
 * where they do not — which classifies as UNTOUCHED and is the truth: nobody
 * proposed anything for them to accept or reject.
 */
function recordRates(
  d: Deps, actor: Actor, r: JobDbRow, rates: readonly RateInput[],
  verdict: ProcessAssurance['verdict'],
  when: 'COMMIT' | 'AMEND',
): void {
  const context = contextFor(r.sector);
  if (context === null) return;
  const lib = libraryFor(d.db, actor.id);
  const store = new OverrideStore();
  const controls = new ControlStore();
  const at = d.now();

  for (const input of rates) {
    if (input.value.trim() === '') continue; // not answered. Not zero.
    const value = Number(input.value.trim().replace(/[%\s]/g, ''));
    if (!Number.isFinite(value)) continue;

    fieldSpec(input.field_id); // throws on a field id the module does not know
    /* A BLANK CONTROL WAS SHOWN EMPTY — `rateLibrary` forced its proposal to null —
       so nothing was proposed, and the event must say so: the surveyor's own library
       figure was NOT on the screen and may not be recorded as if it had been. */
    const blank = isBlankControl(r.id, input.field_id);
    const own = blank ? null : lib.get(actor.id, input.field_id, context);

    /**
     * A STORED FIGURE OF ZERO CANNOT BE THE THING A CHANGE IS MEASURED
     * AGAINST, and the module says so outright: `classifyOutcome` throws
     * E_ZERO_PREFILL because it "cannot express a change from zero as a
     * relative delta". A surveyor who put 0% against a field on one job and
     * 15% on the next is a real and ordinary case, and without this line it
     * would refuse the whole commitment with an error about arithmetic.
     *
     * So a zero entry is still THEIRS and is still offered back to them on
     * screen — what it cannot do is anchor a measurement. The event is
     * recorded with nothing proposed against it, which is the honest
     * description of what happened.
     */
    const prior = own !== null && own !== undefined && own.value !== 0 ? own.value : null;
    /**
     * THE ORIGIN IS THE TRUTH ABOUT WHAT WAS ON THE SCREEN, and since Phase
     * 107a the module can express all of it. `NOTHING_PROPOSED` where the box
     * was empty — which in this build is every first figure, because there are
     * no platform defaults — and `SURVEYOR_LIBRARY` where we put their own
     * earlier figure in front of them. `PLATFORM_DEFAULT` is deliberately
     * unreachable from here: recording it would claim we proposed something.
     */
    const origin: PrefillEvent['prefill_origin'] = prior === null ? 'NOTHING_PROPOSED' : 'SURVEYOR_LIBRARY';

    /**
     * THE EVENT IS BUILT BY THE MODULE, NOT BY THIS FILE.
     *
     * `OverrideStore.record` enforces two rules an inline `classifyOutcome`
     * would have skipped, and both matter:
     *   · A FIELD MARKED NOT REVIEWED WHOSE VALUE MOVED IS A CONTRADICTION and
     *     is refused rather than silently resolved — "a field nobody opened
     *     cannot have been edited".
     *   · A MATERIAL OVERRIDE MUST STATE WHY. At or above the field's own
     *     materiality a reason is required; below it, it is not.
     * Calling the classifier directly and writing the row myself would have
     * left both of those in the module, unreachable, which is the shape of
     * defect this project keeps finding in its own work.
     */
    const e = store.record({
      job_id: r.id, surveyor_id: actor.id, field_id: input.field_id, context,
      prefilled_value: prior ?? value,
      prefill_origin: origin,
      final_value: value,
      reason: input.reason,
      at,
      anchor_verdict: verdict,
      reviewed: input.reviewed,
    });

    d.db.run(
      'INSERT INTO surveyor_rate_events (id, job_id, surveyor_id, field_id, sector, region, ' +
        'prefilled_value, prefill_origin, final_value, outcome, relative_delta, reason, at, ' +
        'anchor_verdict, reviewed, blank_control) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
        'ON CONFLICT (job_id, field_id) DO UPDATE SET final_value = excluded.final_value, ' +
        'outcome = excluded.outcome, relative_delta = excluded.relative_delta, ' +
        'reason = excluded.reason, at = excluded.at, reviewed = excluded.reviewed',
      [d.newId(), r.id, actor.id, e.field_id, e.context.sector, e.context.region,
        e.prefilled_value, e.prefill_origin, e.final_value, e.outcome, e.relative_delta,
        e.reason, e.at, e.anchor_verdict, input.reviewed ? 1 : 0, blank ? 1 : 0],
    );

    /**
     * THE CONTROL OBSERVATION — AND THE DECISION ABOUT WHERE A CONTROL FIELD'S
     * FIGURE GOES. Phase 132, 14 September 2026.
     *
     * IT GOES IN BOTH PLACES, AND THE RATE EVENT ABOVE IS NOT OPTIONAL. The job's
     * rates ARE `surveyor_rate_events`: the job list's "rates recorded" count, the
     * workspace's "recorded on this job" column and the surveyor's own library are
     * all read from it, and nothing else holds a job's rate. A blank control
     * measures anchoring; it must not drop a field from the job the surveyor
     * measured. So the figure is recorded as the job's rate — flagged
     * `blank_control = 1`, origin NOTHING_PROPOSED, which every calibration metric
     * already excludes — AND, where all four conditions below hold, as a control
     * observation.
     *
     * ONLY ON THE COMMITMENT. An amendment is made after our estimate was released,
     * by someone who has now seen our figures; its value is not unanchored. The
     * insert is ON CONFLICT DO NOTHING and migration 023 refuses an edit, so the
     * value committed before release is the observation for good.
     *
     * ONLY ON A CLEAN JOB, AND WITHOUT REFUSING THE COMMITMENT OTHERWISE.
     * `ControlStore.record` refuses a non-CLEAN observation — "an anchored control
     * arm measures nothing" — and that refusal is right for the arm and wrong for
     * the surveyor. A job marked EXPOSED because a client read our figure down the
     * telephone has done nothing to deserve a refused commitment, so on a non-CLEAN
     * job no control row is written and the commitment proceeds.
     *
     * ONLY WHERE THE SURVEYOR CONFIRMED THEY LOOKED. The pre-filled arm this is
     * compared with (`blankControlComparison`) excludes NOT_REVIEWED events, so the
     * control arm excludes unconfirmed ones too — the two arms have to be drawn the
     * same way, or the gap between them measures the difference in how they were
     * drawn. N4: a box left unticked and a box posted as "not sure" are the same
     * `reviewed: false`, and neither writes a control row.
     */
    if (blank && when === 'COMMIT' && verdict === 'CLEAN' && input.reviewed) {
      const o = controls.record({
        job_id: r.id, surveyor_id: actor.id, field_id: e.field_id, context,
        value: e.final_value, at, anchor_verdict: verdict,
      });
      d.db.run(
        'INSERT INTO surveyor_control_observations (id, job_id, surveyor_id, field_id, sector, region, ' +
          'value, at, anchor_verdict) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (job_id, field_id) DO NOTHING',
        [d.newId(), o.job_id, o.surveyor_id, o.field_id, o.context.sector, o.context.region,
          o.value, o.at, o.anchor_verdict],
      );
    }
  }
}

/* ================================================================== *
 * AFTER THE RELEASE — the two things a surveyor may still do
 * ================================================================== */

export type AmendInput = CommitInput & { readonly reason: string };

/**
 * Change your own figures after seeing our estimate.
 *
 * THIS ROUTE EXISTS BECAUSE THE SCREEN SAYS IT DOES. The workspace tells a
 * surveyor "you may amend your own figures after seeing this — you must be
 * able to, if it reveals a genuine error", and a sentence on a page with no
 * route behind it is a lie the next person inherits.
 *
 * THE REASON IS MANDATORY AND THE MODULE ENFORCES IT, not this function: "an
 * unexplained change after seeing our estimate is indistinguishable from
 * anchoring drift". That is the whole reason the amendment is a separate
 * operation from the commitment rather than an edit of it.
 *
 * THE COMMITTED FIGURES ARE NOT OVERWRITTEN. `surveyor_commitments` keeps what
 * was committed BEFORE the estimate was seen, and the amendment lives in the
 * anchor log — which is what makes `driftReport` able to compare the two and
 * measure whether the surveyor moved toward our number. Updating the
 * commitment row would destroy the measurement the quarantine exists to take.
 */
export function amendFigures(
  d: Deps, actor: Actor, job_id: string, input: AmendInput,
): CommitResult {
  const r = loadJob(d.db, actor, job_id);
  authorise(actor, 'surveyor_job.commit', objOf(r));

  const a = pence(input.a_qualifying_plant);
  const b = pence(input.b_building);
  const c = pence(input.c_bare_land);
  const pct = fraction(input.qualifying_pct);
  if (a === null || b === null || c === null) {
    return { ok: false, why: 'The three amounts are figures in pounds, for example 250000 or 250000.00.',
      field: a === null ? 'a_qualifying_plant' : b === null ? 'b_building' : 'c_bare_land' };
  }
  if (pct === null) return { ok: false, why: 'The qualifying percentage is a number between 0 and 100.', field: 'qualifying_pct' };
  if (input.reason.trim() === '') {
    return {
      ok: false,
      why: 'Say why you are changing them. Without a reason, we cannot tell a real fix from ' +
        'being pulled toward our estimate. That pull is what we are here to measure.',
    };
  }

  const est = sealedEstimate(d.db, r.assessment_id);
  if (est === null) return { ok: false, why: 'This job has no locked estimate, so nothing was released.' };

  const q = hydrateQuarantine(d.db, storedJob(r), est, d.now, 'system');
  try {
    return d.db.tx((): CommitResult => {
      const amendment = q.amend({
        surveyor_id: actor.id,
        to: { A_qualifying_plant_pence: a, B_building_pence: b, C_bare_land_pence: c, qualifying_pct: pct },
        reason: input.reason.trim(),
      });
      recordRates(d, actor, r, input.rates, assureProcess(new DbAnchorLog(d.db), job_id).verdict, 'AMEND');
      d.audit.append({
        at: d.now(), kind: 'SURVEYOR_COMMITTED', actor_id: actor.id, actor_role: actor.role,
        object_type: 'surveyor_job', object_id: job_id, outcome: 'ALLOWED',
        detail: { amended: true, at: amendment.at },
      });
      return { ok: true, released_at: amendment.at };
    });
  } catch (e) {
    if (e instanceof QuarantineError) return { ok: false, why: e.message };
    if (e instanceof CrmError) return { ok: false, why: e.message };
    throw e;
  }
}

/**
 * The surveyor tells us the client told them our figure.
 *
 * THE SYSTEM CANNOT PREVENT THIS AND DOES NOT PRETEND TO. A client who has
 * seen a range on our website can read it down the telephone, and no
 * quarantine reaches that conversation. What the system can do is record it,
 * which is the honest position and is the module's own — `reportClientDisclosure`
 * sets `anchor_exposed` and writes a log line, and `assureProcess` then returns
 * EXPOSED rather than CLEAN for that job.
 *
 * AN EXPOSED JOB'S RATE OVERRIDES ARE EXCLUDED FROM CALIBRATION, which is why
 * this is worth a route rather than a note in a file: without it the only way
 * a job becomes EXPOSED is a denied attempt, and the commonest real exposure
 * leaves no trace at all.
 */
export function reportDisclosure(
  d: Deps, actor: Actor, job_id: string, note: string,
): SaveResult {
  const r = loadJob(d.db, actor, job_id);
  authorise(actor, 'surveyor_job.commit', objOf(r));
  if (note.trim() === '') {
    return { ok: false, why: 'Say what you were told and by whom. A bare flag is not evidence.', field: 'detail' };
  }
  const est = sealedEstimate(d.db, r.assessment_id);
  if (est === null) return { ok: false, why: 'This job has no locked estimate, so there is no figure the client could have told you.' };

  const q = hydrateQuarantine(d.db, storedJob(r), est, d.now, 'system');
  q.reportClientDisclosure(actor.id, note.trim());
  return { ok: true };
}

/* ================================================================== *
 * THE PROCESS RECORD — what the log says happened
 * ================================================================== */

export type ProcessView = ProcessAssurance & {
  readonly entries: readonly {
    readonly seq: number; readonly kind: string; readonly at: string; readonly actor: string;
  }[];
  /** Set only after release, and only where a comparison is possible. */
  readonly drift: { readonly moved_toward_estimate: number; readonly amendments: number } | null;
};

/**
 * `assureProcess` READ BACK OUT OF THE DATABASE, not out of the object that
 * wrote it. That is the module's own instruction — "a chain you can only
 * verify through the object that produced it proves nothing" — and it is why
 * DbAnchorLog exists at all.
 *
 * THE DRIFT REPORT IS FOR THE OFFICE, NOT FOR THE SURVEYOR, and it is
 * withheld from them here. It compares their committed figures against OUR
 * estimate, so it carries the estimate in every row. A surveyor who has
 * committed may see the estimate — the quarantine has released it — but a
 * surveyor who has not must not see a drift report of somebody else's job,
 * and the safe direction is to build it only for a role that is on
 * `estimate.read` at all.
 */
export function processRecord(db: Db, actor: Actor, job_id: string): ProcessView {
  const r = loadJob(db, actor, job_id);
  const log = new DbAnchorLog(db);
  const assurance = assureProcess(log, job_id);
  const entries = log.of(job_id).map((e) => ({
    seq: e.seq, kind: e.kind, at: e.at, actor: e.actor,
  }));

  let drift: ProcessView['drift'] = null;
  const est = sealedEstimate(db, r.assessment_id);
  const mayReadEstimate = can(actor, 'estimate.read', {
    type: 'estimate', id: r.assessment_id, business_id: r.business_id,
  });
  if (mayReadEstimate && est !== null && r.state === 'COMMITTED_AND_RELEASED') {
    const q = hydrateQuarantine(db, storedJob(r), est, () => new Date().toISOString(), 'system');
    try {
      const d0 = driftReport(q);
      drift = { moved_toward_estimate: d0.moved_toward_estimate, amendments: d0.amendments };
    } catch { drift = null; }
  }

  return { ...assurance, entries, drift };
}

/* ================================================================== *
 * THE EVIDENCE
 * ================================================================== */

export type EvidenceDoc = {
  readonly id: string; readonly filename: string; readonly doc_type: string | null;
  readonly state: string; readonly byte_size: number | null;
  readonly strip_recorded_at: string | null; readonly quarantine_discharged_at: string | null;
};

export type Evidence = {
  readonly documents: readonly EvidenceDoc[];
  readonly released_always: readonly string[];
  /** Facts the surveyor's own pack is still waiting on. Derived, never a checklist. */
  readonly missing: readonly MissingFact[];
  readonly originals_note: string;
};

/**
 * What the client has given us, and what is still outstanding for THIS pack.
 *
 * AUTHORISED ON THE JOB, NOT ON THE BUSINESS. A surveyor is on
 * `surveyor_job.read` only for a job assigned to them, which is narrower than
 * `business.read` and is the entitlement that actually applies: these are the
 * papers of a job they are doing.
 *
 * THE MISSING LIST IS `missingFacts` FILTERED, NOT REBUILT. Phase 106 derived
 * it from the engine and classified what each fact blocks, with anything
 * unrecognised reported as blocking BOTH packs rather than neither. Writing a
 * second one here is how the two would drift, so this takes that list and
 * drops only the facts attributed to the accountant's pack alone.
 *
 * THERE ARE NO ORIGINALS TO SERVE, and the note says so. Under the settings
 * this build uses the unredacted file is deleted from quarantine once the
 * receipt strip has run and is never promoted to durable storage. What is kept
 * is the structured information read out of it.
 */
export function evidenceFor(db: Db, actor: Actor, job_id: string): Evidence {
  const r = loadJob(db, actor, job_id);
  return {
    // CRM 4 of 10: each one asked of `document.read` on its own document — so a
    // surveyor's evidence is claim evidence, of this job's reach, and never the
    // engagement letter, an invoice or anything else that can carry a value.
    documents: db.all<EvidenceDoc>(
      'SELECT id, filename, doc_type, state, byte_size, strip_recorded_at, ' +
        'quarantine_discharged_at FROM documents WHERE business_id = ? ORDER BY created_at DESC',
      [r.business_id],
    ).filter((x) => { const o = versionObj(db, x.id); return o !== undefined && can(actor, 'document.read', o); }),
    released_always: RELEASED_TO_SURVEYOR_ALWAYS,
    missing: missingFacts(db, actor, r.business_id).filter((f) => f.blocks !== 'ACCOUNTANT'),
    originals_note:
      'The original files are gone. We read each one, then deleted the file, and kept no copy. ' +
      'What we keep is the information we read from it, shown above. That is how it should work.',
  };
}

/* ================================================================== *
 * THE WHOLE WORKSPACE
 * ================================================================== */

export type Workspace = {
  readonly job: JobRow;
  readonly payload: SurveyorPayload;
  readonly rooms: RoomSchedule;
  readonly rates: ReturnType<typeof rateLibrary>;
  readonly evidence: Evidence;
  readonly process: ProcessView;
  readonly quarantine_notice: string;
  /** True where THIS actor is the assigned surveyor and may commit. */
  readonly may_commit: boolean;
  readonly signature: string;
};

/**
 * SIGNATURE IS STUBBED AND THIS SENTENCE IS WHERE IT SAYS SO. It is on the
 * workspace object rather than only in the page, so the JSON payload carries
 * the admission too: a machine reading this endpoint should be told what is
 * not real just as plainly as a person is.
 */
export const SIGNATURE_STUB =
  'E-SIGNING IS NOT SWITCHED ON YET. No signature service is connected, and nothing here is a ' +
  'signed document. Committing your figures saves them with the time and locks them in the audit ' +
  'log, so no one can change them quietly. It also releases our estimate to you. ' +
  'A real signature is a separate step, and it is not built yet.';

export function workspace(d: Deps, actor: Actor, job_id: string): Workspace {
  const r = loadJob(d.db, actor, job_id);
  return {
    job: toRow(d.db, r),
    payload: payloadFor(d, actor, job_id),
    rooms: roomSchedule(d.db, actor, job_id),
    rates: rateLibrary(d.db, actor, job_id),
    evidence: evidenceFor(d.db, actor, job_id),
    process: processRecord(d.db, actor, job_id),
    quarantine_notice: QUARANTINE_NOTICE,
    may_commit: can(actor, 'surveyor_job.commit', objOf(r)),
    signature: SIGNATURE_STUB,
  };
}
