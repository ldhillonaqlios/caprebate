-- ===========================================================================
-- 070 — THE SURVEY PACK: WHAT A SURVEYOR PUT IN, CHANGED OR TOOK OUT, EACH WITH THEIR NAME
-- 1 October 2026. src/web/survey-pack.ts, src/web/pack-sums.ts.
--
-- Lakhbir: "any edits made by the surveyor needs to essentially have their stamp to say thats their number".
--
-- The pack's starting lines and drafts are NOT stored: they are read each time from the fixture list and the evidence
-- (src/web/pack-lines.ts), so a room count recorded later, or an energy certificate found later, comes in by itself.
-- What is stored is only what a person did:
--   survey_packs              one per survey job, and which property it is for;
--   survey_pack_added_lines   a line the surveyor added that the fixture list does not have;
--   survey_pack_entries       every value a surveyor typed, every line taken out or put back — with who, when and why.
--                             The newest entry for a line and field is its value; an entry with no value puts our
--                             draft back. NEVER EDITED, NEVER DELETED: the history is the stamp.
-- ===========================================================================

CREATE TABLE survey_packs (
  id           TEXT PRIMARY KEY,
  job_id       TEXT NOT NULL UNIQUE REFERENCES surveyor_jobs(id),
  -- The property whose purchase is apportioned. NULL only where the company has several and nobody has said which.
  property_id  TEXT REFERENCES properties(id),
  created_at   TEXT NOT NULL,
  created_by   TEXT NOT NULL REFERENCES users(id)
) STRICT;

CREATE TABLE survey_pack_added_lines (
  id        TEXT PRIMARY KEY,
  pack_id   TEXT NOT NULL REFERENCES survey_packs(id),
  label     TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 200),
  unit      TEXT NOT NULL CHECK (length(trim(unit)) BETWEEN 1 AND 40),
  added_by  TEXT NOT NULL REFERENCES users(id),
  added_at  TEXT NOT NULL,
  reason    TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500)
) STRICT;

CREATE TABLE survey_pack_entries (
  id        TEXT PRIMARY KEY,
  pack_id   TEXT NOT NULL REFERENCES survey_packs(id),
  -- The pack's own counter: 1, 2, 3 … A page carries the number it was drawn at, and a change made from an older page
  -- is refused, so two tabs (or two people) never overwrite each other unseen.
  seq       INTEGER NOT NULL CHECK (seq >= 1),
  -- A fixture list id ('LS-GP-001') or an added line's id; NULL for the four values that belong to the whole pack.
  line_key  TEXT,
  field     TEXT NOT NULL CHECK (field IN ('price_paid','land','gia','building_rate','qty','rate','qpct','pool','removed')),
  -- Whole numbers only: pence, thousandths of a unit, hundredths of a per cent, 1 or 0. NULL: our draft again.
  value     INTEGER CHECK (value IS NULL OR value >= 0),
  pool      TEXT CHECK (pool IN ('MP','SR')),
  by_user   TEXT NOT NULL REFERENCES users(id),
  reason    TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  at        TEXT NOT NULL,
  UNIQUE (pack_id, seq),
  CHECK ((line_key IS NULL) = (field IN ('price_paid','land','gia','building_rate'))),
  CHECK (field = 'pool' OR pool IS NULL),
  CHECK (field <> 'pool' OR value IS NULL),
  CHECK (field <> 'removed' OR value IN (0, 1)),
  CHECK (field <> 'qpct' OR value IS NULL OR value <= 10000)
) STRICT;

CREATE INDEX survey_pack_entries_by_line ON survey_pack_entries (pack_id, line_key, field, seq);

CREATE TRIGGER survey_pack_entries_never_edited BEFORE UPDATE ON survey_pack_entries
BEGIN SELECT RAISE(ABORT, 'a survey pack entry is never edited: add a new one'); END;
CREATE TRIGGER survey_pack_entries_never_deleted BEFORE DELETE ON survey_pack_entries
BEGIN SELECT RAISE(ABORT, 'a survey pack entry is never deleted'); END;
CREATE TRIGGER survey_pack_added_lines_never_edited BEFORE UPDATE ON survey_pack_added_lines
BEGIN SELECT RAISE(ABORT, 'an added line is never edited: take it out and add another'); END;
CREATE TRIGGER survey_pack_added_lines_never_deleted BEFORE DELETE ON survey_pack_added_lines
BEGIN SELECT RAISE(ABORT, 'an added line is never deleted: take it out'); END;
CREATE TRIGGER survey_packs_job_never_changes BEFORE UPDATE OF job_id ON survey_packs
BEGIN SELECT RAISE(ABORT, 'a survey pack belongs to one job'); END;
CREATE TRIGGER survey_packs_never_deleted BEFORE DELETE ON survey_packs
BEGIN SELECT RAISE(ABORT, 'a survey pack is never deleted'); END;
