-- ===========================================================================
-- 108 — EVERY RATE NAMES ITS SOURCE, AND THE PACK'S BCIS LOCATION           Phase 159f, 10 October 2026
--
-- The Lockwood run of 9 October 2026 (L12) and the stress test (C19, C20): report pages 4 to 6 labelled every rate
-- "Surveyor" with no source, and a split HMRC cannot trace to a published cost is the weak point of every purchase claim.
-- Lakhbir, 9 October 2026: "With BCIS data loaded, the pack could draft each rate from the right building type — this
-- needs to happen", and "we spoke to BCIS and they said its fine for us to do what we are doing" (relayed by Lakhbir,
-- recorded against Word question 218). So the pack now DRAFTS rates from BCIS (src/web/bcis-data.ts), and a rate the
-- surveyor types carries a structured source of its own, in three new columns of survey_pack_entries:
--
--   rate_basis      BCIS, QS_SCHEDULE (a quantity surveyor's priced schedule), CONTRACTOR_INVOICE or PRICE_BOOK
--   rate_ref        what it is: "BCIS group practice surgeries, mean, 2Q2026", "Smith QS schedule, item 5.8"
--   rate_priced_at  the day the rate is priced at, so it can be brought to the purchase date by the index (C19)
--
-- All three or none, and only on a 'rate' or 'building_rate' entry with a value. An older entry has none and reads as a
-- rate with no source: a version is not approved until every counted rate has one (src/web/pack-approve.ts).
--
-- And one new field, 'location': the BCIS location factor's area for the pack (in rate_ref) and its factor (value, in
-- thousandths). The surveyor's, with a reason, like every value; it moves the pack's counter, so a page drawn before it
-- is refused and an approved version is told apart. None: the UK mean, which moves the rebuild cost and every element
-- alike, so it never changes the qualifying share.
--
-- WHY A REBUILD: the field list is a CHECK, and SQLite cannot widen a CHECK in place. Migration 105's shape, verbatim:
-- one transaction with foreign keys off, every row copied, the index and the two triggers made again, the guard.
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
  -- Phase 159c: for a works value, the event's id (property_events.id).
  line_key  TEXT,
  field     TEXT NOT NULL CHECK (field IN ('price_paid','land','gia','building_rate','qty','rate','qpct','pool','removed','vat_position','vat','shared_area',
                                           'valuation_date','insurance','insurance_date','insurance_includes','rebuild_includes',
                                           'works_total','works_main','works_special','works_bwic','works_demolition','works_other',
                                           'works_repairs','works_prelims','works_fees',
                                           'location')),
  -- Whole numbers only: pence, thousandths of a unit, hundredths of a per cent, 1 or 0. NULL: our draft again.
  value     INTEGER CHECK (value IS NULL OR value >= 0),
  pool      TEXT CHECK (pool IN ('MP','SR')),
  by_user   TEXT NOT NULL REFERENCES users(id),
  reason    TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  at        TEXT NOT NULL,
  -- Phase 159f: a rate's source (BCIS, a QS's priced schedule, the contractor's invoice or a price book), what it is,
  -- and the day it is priced at — all three or none, and only on a rate. For 'location', rate_ref is the BCIS area.
  rate_basis     TEXT CHECK (rate_basis IS NULL OR rate_basis IN ('BCIS','QS_SCHEDULE','CONTRACTOR_INVOICE','PRICE_BOOK')),
  rate_ref       TEXT CHECK (rate_ref IS NULL OR length(trim(rate_ref)) BETWEEN 1 AND 200),
  rate_priced_at TEXT CHECK (rate_priced_at IS NULL OR rate_priced_at GLOB '[12][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  UNIQUE (pack_id, seq),
  CHECK ((line_key IS NULL) = (field IN ('price_paid','land','gia','building_rate','vat_position','vat','shared_area',
                                         'valuation_date','insurance','insurance_date','insurance_includes','rebuild_includes',
                                         'location'))),
  CHECK (field = 'pool' OR pool IS NULL),
  CHECK (field <> 'pool' OR value IS NULL),
  CHECK (field <> 'removed' OR value IN (0, 1)),
  CHECK (field <> 'qpct' OR value IS NULL OR value <= 10000),
  -- Phase 153e: the VAT position is a code: 0 reclaims it all, 1 exempt, 2 partly exempt, 3 not known.
  CHECK (field <> 'vat_position' OR value IS NULL OR value IN (0, 1, 2, 3)),
  -- Phase 157a: a date is YYYYMMDD; what a figure includes is 0 to 7.
  CHECK (field NOT IN ('valuation_date','insurance_date') OR value IS NULL OR value BETWEEN 19000101 AND 21001231),
  CHECK (field NOT IN ('insurance_includes','rebuild_includes') OR value IS NULL OR value BETWEEN 0 AND 7),
  -- Phase 159c: a works value is money, at most £1bn, as every other amount in the pack.
  CHECK (field NOT GLOB 'works_*' OR value IS NULL OR value <= 100000000000),
  -- Phase 159f: a rate's source is all three or none, and only on a rate with a value.
  CHECK ((rate_basis IS NULL) = (rate_priced_at IS NULL)),
  CHECK (rate_basis IS NULL OR (field IN ('rate','building_rate') AND value IS NOT NULL AND rate_ref IS NOT NULL)),
  -- The BCIS location: the area in rate_ref and its factor in thousandths in value (500 to 2000); both NULL puts the
  -- UK mean back. rate_ref is only ever the area on a 'location' entry, or a rate's reference.
  CHECK (field <> 'location' OR ((value IS NULL) = (rate_ref IS NULL) AND (value IS NULL OR value BETWEEN 500 AND 2000))),
  CHECK (rate_ref IS NULL OR rate_basis IS NOT NULL OR field = 'location')
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
