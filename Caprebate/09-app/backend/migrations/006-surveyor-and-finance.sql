-- ===========================================================================
-- 006 — the surveyor's review-and-sign workspace, and Caprebate's own finance.
--                                                       Phase 107, 9 Sep 2026
--
-- Migration 002 already created `surveyor_jobs`, `estimates` and `invoices`.
-- THIS MIGRATION MAKES FOUR THINGS RECORDABLE that those tables could only
-- imply, and it adds nothing that re-decides a rule a module already owns.
--
--   1. THE ANCHOR LOG, PERSISTED. caprebate-anchor-quarantine.ts keeps a
--      hash-chained log in memory and `verifyChain` is exported so a chain
--      READ BACK FROM ANYWHERE can be checked. This is that anywhere. The
--      columns are the module's own LogEntry, field for field.
--
--   2. THE COMMITMENT. The surveyor's own figures, their content hash, the
--      method note, and the moment the estimate was released to them. The
--      module computes all four; this stores what it returned.
--
--   3. THE QUANTITIES. A count per room type, entered by the surveyor. The
--      room list itself is `src/web/rooms.ts`, transcribed from phase9, and a
--      count is deliberately not in it: a count is a fact about one building
--      and the survey is where it comes from.
--
--   4. THE RATE LIBRARY'S EVENTS. caprebate-surveyor-crm.ts models the
--      library, the adoption metric and the drift cohorts, and holds them in
--      memory. Its PrefillEvent is the durable unit — the library and the
--      store are both rebuilt by replaying these rows through the module, so
--      the module stays the authority and this table stays a transcript.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · THE ANCHOR LOG
--
-- APPEND-ONLY IN THE SAME TWO WAYS AS `audit_log`: triggers that abort an
-- UPDATE or a DELETE, and a hash chain that makes a change made outside the
-- application detectable. The chain is the module's, not a second scheme —
-- `verifyChain` recomputes these rows and there is a test that it does.
--
-- `seq` IS GLOBAL, NOT PER JOB, because that is what the module does:
-- AnchorLog numbers every entry it holds and chains each to the one before it,
-- whichever job it belongs to. A per-job chain would let an entire job's
-- history be removed without breaking anything.
--
-- `detail_json` CARRIES NO PERSONAL DATA and no estimate figure. The module is
-- explicit about the second: ESTIMATE_SEALED logs the HASH and never the
-- figures, "the log itself must not leak the anchor".
-- ---------------------------------------------------------------------------
CREATE TABLE anchor_log (
  seq         INTEGER PRIMARY KEY,
  kind        TEXT NOT NULL,
  job_id      TEXT NOT NULL,
  actor       TEXT NOT NULL,
  at          TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  prev_hash   TEXT NOT NULL,
  hash        TEXT NOT NULL
) STRICT;

CREATE INDEX anchor_log_job_idx ON anchor_log(job_id, seq);

CREATE TRIGGER anchor_log_no_update BEFORE UPDATE ON anchor_log
BEGIN SELECT RAISE(ABORT, 'anchor_log is append-only'); END;

CREATE TRIGGER anchor_log_no_delete BEFORE DELETE ON anchor_log
BEGIN SELECT RAISE(ABORT, 'anchor_log is append-only'); END;

-- ---------------------------------------------------------------------------
-- 2 · THE COMMITMENT, AND THE RELEASE
--
-- ONE ROW PER JOB, and the UNIQUE constraint is the point: the module refuses a
-- second commit with E_ALREADY_COMMITTED, and a schema that permitted two rows
-- would be a second place for that rule to be wrong.
--
-- `figures_hash` IS THE MODULE'S `hashFigures`. It is stored so that a
-- committed figure cannot be quietly rewritten later — the same reason the
-- module computes it.
--
-- `released_at` IS ON THE COMMITMENT AND NOT ON THE JOB, because the release is
-- caused by the commitment and by nothing else. There is no release action, so
-- there is nobody to ask for early access; putting the timestamp anywhere the
-- commitment is not would invite one.
--
-- POST-RELEASE AMENDMENTS ARE NOT HERE. They are in the anchor log, which is
-- where the module puts them, and the log is the thing an auditor reads. A
-- second copy in a table would be a second thing to keep true.
-- ---------------------------------------------------------------------------
CREATE TABLE surveyor_commitments (
  id            TEXT PRIMARY KEY,
  job_id        TEXT NOT NULL UNIQUE REFERENCES surveyor_jobs(id),
  surveyor_id   TEXT NOT NULL REFERENCES users(id),
  -- The module's SurveyorFigures, in integer pence except the percentage.
  a_qualifying_plant_pence INTEGER NOT NULL,
  b_building_pence         INTEGER NOT NULL,
  c_bare_land_pence        INTEGER NOT NULL,
  qualifying_pct           REAL    NOT NULL,
  -- Mandatory in the module: a commitment must state the basis it was reached on.
  method_note   TEXT NOT NULL,
  committed_at  TEXT NOT NULL,
  figures_hash  TEXT NOT NULL,
  released_at   TEXT NOT NULL
) STRICT;

-- ---------------------------------------------------------------------------
-- 3 · THE QUANTITIES
--
-- `room_count` IS NULLABLE AND NULL IS THE STARTING STATE. Not zero. A room type
-- nobody has counted and a room type counted at none are different facts, and
-- N4 governs: an absent count must not become a nought. The workspace shows
-- them differently and the surveyor has to say which it is.
-- ---------------------------------------------------------------------------
CREATE TABLE surveyor_room_counts (
  id          TEXT PRIMARY KEY,
  job_id      TEXT NOT NULL REFERENCES surveyor_jobs(id),
  -- A room id from src/web/rooms.ts. Not a foreign key: the list is code,
  -- because it is a transcription of a document rather than client data.
  room_id     TEXT NOT NULL,
  room_count  INTEGER,
  note        TEXT,
  recorded_by TEXT NOT NULL REFERENCES users(id),
  recorded_at TEXT NOT NULL,
  UNIQUE (job_id, room_id)
) STRICT;

CREATE INDEX surveyor_room_counts_job_idx ON surveyor_room_counts(job_id);

-- ---------------------------------------------------------------------------
-- 4 · THE RATE LIBRARY'S EVENTS
--
-- ONE ROW PER PrefillEvent, in the module's own field names. `outcome` and
-- `relative_delta` are stored even though the module re-derives both from the
-- prefilled and final values, because they are what the event MEANT at the
-- time: `materiality` is a property of the field spec, and a spec that is
-- retuned later would silently restate every historic classification if the
-- outcome were computed at read time. The same argument migration 005 makes
-- about a fired source's publisher and licence.
--
-- `anchor_verdict` IS WHY THIS TABLE AND THE ANCHOR LOG CANNOT BE SEPARATED.
-- The CRM excludes an EXPOSED job's overrides from calibration — the surveyor
-- had seen our estimate before committing, so their figures are contaminated.
-- The verdict is `assureProcess`'s, read off the log at the moment the event
-- was recorded.
--
-- `reviewed` DISTINGUISHES UNTOUCHED FROM NOT_REVIEWED, which look identical
-- in the data and mean opposite things — a surveyor who looked at our number
-- and agreed, and a surveyor who never looked. The module says the distinction
-- cannot be inferred after the fact and has to come from a positive
-- confirmation step in the flow. This build has one: the workspace's per-field
-- "I have checked this" box, and this column is where its answer lands.
-- ---------------------------------------------------------------------------
CREATE TABLE surveyor_rate_events (
  id             TEXT PRIMARY KEY,
  job_id         TEXT NOT NULL REFERENCES surveyor_jobs(id),
  surveyor_id    TEXT NOT NULL REFERENCES users(id),
  field_id       TEXT NOT NULL,
  sector         TEXT NOT NULL,
  region         TEXT NOT NULL,
  prefilled_value REAL NOT NULL,
  prefill_origin TEXT NOT NULL,
  final_value    REAL NOT NULL,
  outcome        TEXT NOT NULL,
  relative_delta REAL NOT NULL,
  reason         TEXT,
  at             TEXT NOT NULL,
  anchor_verdict TEXT NOT NULL,
  reviewed       INTEGER NOT NULL DEFAULT 1,
  UNIQUE (job_id, field_id)
) STRICT;

CREATE INDEX surveyor_rate_events_surveyor_idx ON surveyor_rate_events(surveyor_id, field_id);

-- ---------------------------------------------------------------------------
-- 5 · THE FIVE FACTS THE FEE COMPARISON NEEDS, ON THE INVOICE ITSELF
--
-- THIS IS THE SHAPE RESTRICTION BEING KEPT, NOT WEAKENED. Migration 002 says
-- the invoice is "the whole of what the ACCOUNTING role may see about a
-- client", with no join to the questions, the register data, the notes or the
-- surveyor's workings. CB_FEE and CB_BENEFIT need the entity type, a marginal
-- rate, the pool split and the period start to compare our fee against what
-- the client actually gets back — and the alternative to these columns is a
-- finance screen that reaches into `assessment_answers` and `estimates` at
-- display time, which is exactly the join this table exists not to have.
--
-- So the facts are COPIED ONTO THE INVOICE when it is raised, and they are
-- facts about the FEE rather than about the tax affairs: what the comparison
-- was computed on. Every one is NULLABLE, and an absent one is not a default.
-- CB_BENEFIT bounds an unknown rather than guessing it — an absent pool split
-- gives a RANGE across the two extremes and says so, and an absent tax rate
-- gives `modelled:false` with the engine's own sentence. Neither becomes a
-- number nobody established. That is N4 at the database.
--
-- `entity_type` TAKES THE ENGINE'S OWN THREE KEYS, because CB_RATES.rangeFor
-- is keyed on them and a fourth vocabulary for the same idea is how the last
-- four role lists in this project got out of step.
--
-- NO PAYMENT COLUMN BEYOND THE STATUS 002 ALREADY HAS. No card processor, no
-- reference, no settlement date, no gateway id — by decision. Invoices are
-- recorded here and collected elsewhere, and a column shaped like a payment
-- would invite somebody to build one.
-- ---------------------------------------------------------------------------
ALTER TABLE invoices ADD COLUMN entity_type TEXT
  CHECK (entity_type IN ('company','uninc_ruk','uninc_scot'));
ALTER TABLE invoices ADD COLUMN tax_rate REAL;
ALTER TABLE invoices ADD COLUMN pool_split_main_pence INTEGER;
ALTER TABLE invoices ADD COLUMN pool_split_special_pence INTEGER;
ALTER TABLE invoices ADD COLUMN period_start TEXT;
