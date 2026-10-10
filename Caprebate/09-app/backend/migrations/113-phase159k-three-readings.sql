-- ===========================================================================
-- 113 — THREE READINGS IN THE SURVEY PACK: LONG-LIFE ASSETS, ASBESTOS REMEDIATION, AND s.33B    Phase 159k, 10 October 2026
--
-- Carried from Phase 159i (item 3): three claim readings the pack could not apply, because it held no input for them.
-- Each is a part of a figure the surveyor already gives, optional, with a reason like every value. Not given: the
-- reading is not applied, and the pack says so.
--
--   long_life             the purchase's main pool plant with an expected life of 25 years or more (s.91), in pence
--   works_long_life       the same, of a piece of work's main pool plant (part of works_main)
--   works_asbestos        the part of a piece of work spent removing asbestos (part of works_other): land remediation
--                         relief for a company (CTA 2009 Part 14), never an allowance
--   works_repairs_if      the part of the repairs spent on integral features (part of works_repairs)
--   works_if_replacement  what replacing those integral features would cost: s.33B makes the repairs capital where they
--                         pass half of it in twelve months
--
-- And one claim fact, ASBESTOS_AT_ACQUISITION: the asbestos was there when the client acquired the land (CTA 2009
-- s.1145). Land remediation relief needs it; not known, it is not given (N4).
--
-- WHY A REBUILD: the field list is a CHECK. Migration 108's shape, verbatim: one transaction with foreign keys off,
-- every row copied (every column, 108's rate source included), the index and the two triggers made again, the guard.
-- claim_facts_key_insert is made again with the new key, as migrations 106, 107 and 110 did.
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
                                           'location',
                                           -- Phase 159k: the three readings' parts
                                           'long_life','works_long_life','works_asbestos','works_repairs_if','works_if_replacement')),
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
                                         'location','long_life'))),
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
  -- Phase 159k: the purchase's long-life part is money too.
  CHECK (field <> 'long_life' OR value IS NULL OR value <= 100000000000),
  -- Phase 159f: a rate's source is all three or none, and only on a rate with a value.
  CHECK ((rate_basis IS NULL) = (rate_priced_at IS NULL)),
  CHECK (rate_basis IS NULL OR (field IN ('rate','building_rate') AND value IS NOT NULL AND rate_ref IS NOT NULL)),
  -- The BCIS location: the area in rate_ref and its factor in thousandths in value (500 to 2000); both NULL puts the
  -- UK mean back. rate_ref is only ever the area on a 'location' entry, or a rate's reference.
  CHECK (field <> 'location' OR ((value IS NULL) = (rate_ref IS NULL) AND (value IS NULL OR value BETWEEN 500 AND 2000))),
  CHECK (rate_ref IS NULL OR rate_basis IS NOT NULL OR field = 'location')
) STRICT;

INSERT INTO survey_pack_entries_new (id, pack_id, seq, line_key, field, value, pool, by_user, reason, at, rate_basis, rate_ref, rate_priced_at)
SELECT id, pack_id, seq, line_key, field, value, pool, by_user, reason, at, rate_basis, rate_ref, rate_priced_at FROM survey_pack_entries;

DROP TABLE survey_pack_entries;

ALTER TABLE survey_pack_entries_new RENAME TO survey_pack_entries;

CREATE INDEX survey_pack_entries_by_line ON survey_pack_entries (pack_id, line_key, field, seq);

CREATE TRIGGER survey_pack_entries_never_edited BEFORE UPDATE ON survey_pack_entries
BEGIN SELECT RAISE(ABORT, 'a survey pack entry is never edited: add a new one'); END;
CREATE TRIGGER survey_pack_entries_never_deleted BEFORE DELETE ON survey_pack_entries
BEGIN SELECT RAISE(ABORT, 'a survey pack entry is never deleted'); END;

DROP TRIGGER claim_facts_key_insert;

CREATE TRIGGER claim_facts_key_insert BEFORE INSERT ON claim_facts
WHEN NEW.fact_key NOT IN (
  'ACCOUNTING_PERIOD_START','ACCOUNTING_PERIOD_END','SUFFICIENT_PROFIT','AIA_HEADROOM','AIA_HEADROOM_AMOUNT',
  'POOL_SPLIT_MAIN','POOL_SPLIT_SPECIAL','SBA_QUALIFYING_EXPENDITURE',
  'ELECTION_EXISTS','ELECTION_SECTION','ELECTION_NOTIFIED_ON','ELECTION_VALUE','ELECTION_ELEMENTS',
  'ELECTION_TRIBUNAL_APPLIED_ON','ELECTION_TRIBUNAL_STATUS',
  'GRANTS_EXIST','ACQUISITION_COSTS','TRANSACTION_TAX','BUYER_ALTERATIONS','BUYER_ALTERATIONS_AMOUNT',
  'SCOTTISH_TAXPAYER','PARTNERSHIP_HAS_COMPANY_MEMBER','BOUGHT_THE_BUILDING',
  'GRANT_PROVIDER_CHECKED','GRANT_SPLIT_ADVISER_VIEW','STILL_OWNED',
  'CASH_BASIS','BOUGHT_NEW_FROM_DEVELOPER','SBA_STATEMENT_HELD',
  'VAT_CGS_ADJUSTMENT','ASBESTOS_AT_ACQUISITION')
BEGIN SELECT RAISE(ABORT, 'claim_facts.fact_key is not a fact the claim captures'); END;

CREATE TABLE _fk_check_guard (ok INTEGER NOT NULL CHECK (ok = 0)) STRICT;
INSERT INTO _fk_check_guard (ok) SELECT count(*) FROM pragma_foreign_key_check;
DROP TABLE _fk_check_guard;

COMMIT;

PRAGMA foreign_keys = ON;
