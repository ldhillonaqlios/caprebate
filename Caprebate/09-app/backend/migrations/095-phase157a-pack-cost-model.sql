-- ===========================================================================
-- 095 — THE COST MODEL IN THE SURVEY PACK: THE VALUATION DATE AND THE INSURANCE CHECK   Phase 157a, 6 October 2026
--
-- Phase 153e built three of the surveyor's questions in the cost model's own test system
-- (04-phase-work/phase9/caprebate-cost-model.cjs): preliminaries by job size (Word question 136), the insurance
-- cross-check (137) and the index factor (147). Phase 157a shows them in the pack (src/web/pack-cost-model.ts), as
-- test placeholders, and the pack needs five values it did not hold, each the surveyor's, with a reason:
--   valuation_date      the date the rebuild cost is priced at, as YYYYMMDD (20261006); the index runs from it
--   insurance           the insurance rebuild (reinstatement) figure, in pence
--   insurance_date      the date of that figure, as YYYYMMDD
--   insurance_includes  what the insurance figure includes: 1 demolition + 2 professional fees + 4 preliminaries (0 to 7)
--   rebuild_includes    what OUR rebuild cost includes, the same way
-- An unanswered value is no entry at all, and the check says "not comparable" (N4): never assumed included or not.
-- All five belong to the whole pack (no line). The field CHECK cannot change in place, so the table is rebuilt the way
-- migration 082 rebuilt it: every row copied, its index and two triggers made again word for word.
-- ===========================================================================

PRAGMA foreign_keys = OFF;

BEGIN;

CREATE TABLE survey_pack_entries_new (
  id        TEXT PRIMARY KEY,
  pack_id   TEXT NOT NULL REFERENCES survey_packs(id),
  -- The pack's own counter: 1, 2, 3 … A page carries the number it was drawn at, and a change made from an older page
  -- is refused, so two tabs (or two people) never overwrite each other unseen.
  seq       INTEGER NOT NULL CHECK (seq >= 1),
  -- A fixture list id ('LS-GP-001') or an added line's id; NULL for the values that belong to the whole pack.
  line_key  TEXT,
  field     TEXT NOT NULL CHECK (field IN ('price_paid','land','gia','building_rate','qty','rate','qpct','pool','removed','vat_position','vat','shared_area',
                                           'valuation_date','insurance','insurance_date','insurance_includes','rebuild_includes')),
  -- Whole numbers only: pence, thousandths of a unit, hundredths of a per cent, 1 or 0. NULL: our draft again.
  value     INTEGER CHECK (value IS NULL OR value >= 0),
  pool      TEXT CHECK (pool IN ('MP','SR')),
  by_user   TEXT NOT NULL REFERENCES users(id),
  reason    TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  at        TEXT NOT NULL,
  UNIQUE (pack_id, seq),
  CHECK ((line_key IS NULL) = (field IN ('price_paid','land','gia','building_rate','vat_position','vat','shared_area',
                                         'valuation_date','insurance','insurance_date','insurance_includes','rebuild_includes'))),
  CHECK (field = 'pool' OR pool IS NULL),
  CHECK (field <> 'pool' OR value IS NULL),
  CHECK (field <> 'removed' OR value IN (0, 1)),
  CHECK (field <> 'qpct' OR value IS NULL OR value <= 10000),
  -- Phase 153e: the VAT position is a code: 0 reclaims it all, 1 exempt, 2 partly exempt, 3 not known.
  CHECK (field <> 'vat_position' OR value IS NULL OR value IN (0, 1, 2, 3)),
  -- Phase 157a: a date is YYYYMMDD; what a figure includes is 0 to 7.
  CHECK (field NOT IN ('valuation_date','insurance_date') OR value IS NULL OR value BETWEEN 19000101 AND 21001231),
  CHECK (field NOT IN ('insurance_includes','rebuild_includes') OR value IS NULL OR value BETWEEN 0 AND 7)
) STRICT;

INSERT INTO survey_pack_entries_new (id, pack_id, seq, line_key, field, value, pool, by_user, reason, at)
SELECT id, pack_id, seq, line_key, field, value, pool, by_user, reason, at FROM survey_pack_entries;

DROP TABLE survey_pack_entries;

ALTER TABLE survey_pack_entries_new RENAME TO survey_pack_entries;

CREATE INDEX survey_pack_entries_by_line ON survey_pack_entries (pack_id, line_key, field, seq);

CREATE TRIGGER survey_pack_entries_never_edited BEFORE UPDATE ON survey_pack_entries
BEGIN SELECT RAISE(ABORT, 'a survey pack entry is never edited: add a new one'); END;
CREATE TRIGGER survey_pack_entries_never_deleted BEFORE DELETE ON survey_pack_entries
BEGIN SELECT RAISE(ABORT, 'a survey pack entry is never deleted'); END;

CREATE TABLE _fk_check_guard (ok INTEGER NOT NULL CHECK (ok = 0)) STRICT;
INSERT INTO _fk_check_guard (ok) SELECT count(*) FROM pragma_foreign_key_check;
DROP TABLE _fk_check_guard;

COMMIT;

PRAGMA foreign_keys = ON;
