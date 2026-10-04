-- ===========================================================================
-- 082 — CHAPTER 15'S VAT HALF                                   Phase 153e, 4 October 2026
--
-- Module 00 C23: VAT the client paid and could not reclaim is part of the spend. Built on our recommendation, for the
-- surveyor and the tax adviser to check, as two pack inputs with their source (src/web/pack-vat.ts):
--   vat_position  0 reclaims it all · 1 exempt · 2 partly exempt (unresolved: never counted) · 3 not known (never counted)
--   vat           the VAT paid that could not be reclaimed, in pence
-- Both belong to the whole pack (no line). The field CHECK cannot change in place, so the table is rebuilt the way
-- migration 007 rebuilt `businesses`: every row copied, its index and two triggers made again word for word.
-- ===========================================================================

PRAGMA foreign_keys = OFF;

BEGIN;

CREATE TABLE survey_pack_entries_new (
  id        TEXT PRIMARY KEY,
  pack_id   TEXT NOT NULL REFERENCES survey_packs(id),
  -- The pack's own counter: 1, 2, 3 … A page carries the number it was drawn at, and a change made from an older page
  -- is refused, so two tabs (or two people) never overwrite each other unseen.
  seq       INTEGER NOT NULL CHECK (seq >= 1),
  -- A fixture list id ('LS-GP-001') or an added line's id; NULL for the four values that belong to the whole pack.
  line_key  TEXT,
  field     TEXT NOT NULL CHECK (field IN ('price_paid','land','gia','building_rate','qty','rate','qpct','pool','removed','vat_position','vat')),
  -- Whole numbers only: pence, thousandths of a unit, hundredths of a per cent, 1 or 0. NULL: our draft again.
  value     INTEGER CHECK (value IS NULL OR value >= 0),
  pool      TEXT CHECK (pool IN ('MP','SR')),
  by_user   TEXT NOT NULL REFERENCES users(id),
  reason    TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  at        TEXT NOT NULL,
  UNIQUE (pack_id, seq),
  CHECK ((line_key IS NULL) = (field IN ('price_paid','land','gia','building_rate','vat_position','vat'))),
  CHECK (field = 'pool' OR pool IS NULL),
  CHECK (field <> 'pool' OR value IS NULL),
  CHECK (field <> 'removed' OR value IN (0, 1)),
  CHECK (field <> 'qpct' OR value IS NULL OR value <= 10000),
  -- Phase 153e: the VAT position is a code: 0 reclaims it all, 1 exempt, 2 partly exempt, 3 not known.
  CHECK (field <> 'vat_position' OR value IS NULL OR value IN (0, 1, 2, 3))
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
