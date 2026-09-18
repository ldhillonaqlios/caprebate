-- ===========================================================================
-- 023 · THE BLANK-FIELD CONTROL — what a surveyor put in a field shown EMPTY
--
-- Phase 132, 14 September 2026. Calibration instrument open item O-2
-- (04-phase-work/phase9/calibration-instrument-v1.md §5): "one job in ten must
-- actually be shown an empty field". `isBlankControl(job_id, field_id)` in
-- caprebate-surveyor-crm.ts decides which; until today nothing honoured it.
--
-- IT HAS TO EXIST BEFORE THE FIRST JOB AND IT CANNOT BE RETROFITTED. A control
-- needs an unanchored comparison arm, and every job run before the control
-- starts has already seen a pre-fill and can serve as neither arm. The
-- instrument's own words: "Start at job 20 and the first 19 are unusable."
--
-- THE COLUMNS ARE THE REGISTER'S HEADER, IN ITS ORDER. The design fixes a CSV
-- for the control arm at 04-phase-work/phase9/calibration/blank-control-register.csv:
--     job_id,surveyor_id,field_id,sector,region,value,at,anchor_verdict
-- and this table carries exactly those, plus an id. No prefilled_value, no
-- outcome, no relative_delta: there was no pre-fill, so there is nothing to
-- compare against, and inventing those columns would invent a comparison the
-- observation does not contain — the module's own reason ControlObservation is
-- not a PrefillEvent.
--
-- `anchor_verdict` CAN ONLY BE 'CLEAN'. `ControlStore.record` refuses anything
-- else, "An anchored control arm measures nothing", and the database refuses it
-- too. An EXPOSED or incomplete job writes NO row here — the application skips
-- it rather than refusing the surveyor's commitment, because a surveyor whose
-- client read our figure down the telephone has done nothing wrong.
--
-- ONE OBSERVATION PER JOB AND FIELD, AND IT IS NEVER CHANGED. The value that
-- matters is the one committed BEFORE our estimate was released. An amendment
-- after release is made by someone who has now seen our figures, so it is not
-- an unanchored value; the application inserts with ON CONFLICT DO NOTHING and
-- the triggers below refuse an edit or a removal outright.
-- ---------------------------------------------------------------------------
CREATE TABLE surveyor_control_observations (
  id             TEXT PRIMARY KEY,
  job_id         TEXT NOT NULL REFERENCES surveyor_jobs(id),
  surveyor_id    TEXT NOT NULL REFERENCES users(id),
  field_id       TEXT NOT NULL,
  sector         TEXT NOT NULL,
  region         TEXT NOT NULL,
  value          REAL NOT NULL,
  at             TEXT NOT NULL,
  anchor_verdict TEXT NOT NULL CHECK (anchor_verdict = 'CLEAN'),
  UNIQUE (job_id, field_id)
) STRICT;

CREATE INDEX surveyor_control_observations_field_idx ON surveyor_control_observations(field_id, sector);

CREATE TRIGGER surveyor_control_observations_fixed BEFORE UPDATE ON surveyor_control_observations
BEGIN SELECT RAISE(ABORT, 'a control observation is not edited: the value committed before release is the observation'); END;

CREATE TRIGGER surveyor_control_observations_never_deleted BEFORE DELETE ON surveyor_control_observations
BEGIN SELECT RAISE(ABORT, 'a control observation is never deleted: an arm with rows removed is not a control'); END;

-- ---------------------------------------------------------------------------
-- THE CONTROL FIELD'S VALUE STILL COUNTS FOR THE JOB — so it is flagged, not moved.
--
-- `surveyor_rate_events` is where a job's rates live: the job list's "rates
-- recorded" count reads it, the workspace's "recorded on this job" column reads
-- it, and the surveyor's own library is rebuilt from it. Routing a control
-- field's figure OUT of it would drop a field from the job the surveyor
-- measured. So the figure is written to BOTH tables, and this column says which
-- rate events were shown as a blank control. It is recorded with origin
-- NOTHING_PROPOSED, which every calibration metric already excludes, so the
-- flagged row cannot leak into the pre-filled arm.
--
-- DEFAULT 0 IS TRUE OF EVERY ROW ALREADY STORED: no job before this migration
-- was ever shown a blank control, because nothing served one.
-- ---------------------------------------------------------------------------
ALTER TABLE surveyor_rate_events ADD COLUMN blank_control INTEGER NOT NULL DEFAULT 0
  CHECK (blank_control IN (0,1));
