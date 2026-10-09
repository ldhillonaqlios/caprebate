-- ===========================================================================
-- 105 — SEVERAL EVENTS ON ONE BUILDING: A PURCHASE, THEN THE WORKS          Phase 159c, 9 October 2026
--
-- The stress test of 9 October 2026 (E1; the Lockwood Surgery run, L5): a GP surgery bought for £650,000 and then
-- refurbished for £90,000 reached a figure for the purchase alone. The works were kept only as an assessment answer, no
-- figure read them, and the pack could not price them. Lakhbir: "that's a design gap - this is needed".
--
-- 1 · property_events — WHAT HAPPENED TO EACH BUILDING, IN ORDER. The first event is how the client came to have it
--     (bought it, built it, fitted out a lease); every later one is work done since (a refit, an extension, a
--     conversion, redecoration or repairs). Each has its own date and its own cost, because each is its own spend with
--     its own period and its own route (CAA 2001 ss.11, 58). The assessment writes them (source ASSESSMENT); a person
--     may add one on the claim (STAFF). A cost not known is NULL, never 0 (N4). A date is "YYYY-MM" or "YYYY", as the
--     client gave it, or NULL. `vat` is carried for Phase 159i (VAT on each event), NULL until then.
--
-- 2 · the survey pack's COST-LED VALUES for each piece of work (Phase 159c, item 4). Own-cost works are claimed on what
--     they cost, from the final account or the contract sum by element — not shared out of a price by rebuild cost,
--     which is the purchase's method (s.562). Each value belongs to one event (line_key = the event's id) and is the
--     surveyor's, with a reason, in pence:
--       works_total       the final account, or the contract sum: what the work cost in all
--       works_main        plant and machinery in it (the main pool)
--       works_special     integral features in it: wiring, lighting, heating, water, lifts (the special rate pool)
--       works_bwic        builder's work in connection with that plant (s.25): it follows the plant it serves
--       works_demolition  taking out old plant (s.26): it follows the new plant
--       works_other       the rest of the building work, which does not qualify
--       works_repairs     the part that is a repair: a deduction from profits, never an allowance (chapter 20)
--       works_prelims     the preliminaries, shared out over the rest
--       works_fees        the professional fees, shared out over the rest
--     The field CHECK cannot change in place, so the table is rebuilt the way migrations 082 and 095 rebuilt it: every
--     row copied, its index and its two triggers made again word for word.
--
-- 3 · the final account on the upload lists (item 6, F16+). The contractor's elemental cost breakdown is the document
--     the cost-led values come from, and on a finished job it is the final account: its label now says so. Its code,
--     source and receipt policy are unchanged (document_types_fixed refuses those; a label may change).
-- ===========================================================================

PRAGMA foreign_keys = OFF;

BEGIN;

CREATE TABLE property_events (
  id           TEXT PRIMARY KEY,
  property_id  TEXT NOT NULL REFERENCES properties(id),
  business_id  TEXT NOT NULL REFERENCES businesses(id),
  -- 1 for the first event, then 2, 3 … in the order given.
  ord          INTEGER NOT NULL CHECK (ord >= 1),
  kind         TEXT NOT NULL CHECK (kind IN ('PURCHASE','NEW_BUILD','EXTENSION','REFURBISHMENT','FIT_OUT','CONVERSION','REPAIRS','OTHER')),
  -- "YYYY-MM" or "YYYY"; NULL where not known.
  event_date   TEXT CHECK (event_date IS NULL OR event_date GLOB '[12][0-9][0-9][0-9]' OR event_date GLOB '[12][0-9][0-9][0-9]-[01][0-9]'),
  -- Whole pence; NULL where not known (never 0 for "not known").
  cost_pence   INTEGER CHECK (cost_pence IS NULL OR cost_pence >= 0),
  vat          TEXT CHECK (vat IS NULL OR vat IN ('INCLUDED_NOT_RECLAIMABLE','EXCLUDED_OR_RECLAIMED','NOT_KNOWN')),
  source       TEXT NOT NULL CHECK (source IN ('ASSESSMENT','STAFF')),
  assessment_id TEXT REFERENCES assessments(id),
  created_at   TEXT NOT NULL,
  created_by   TEXT REFERENCES users(id),
  UNIQUE (property_id, ord),
  CHECK (source <> 'ASSESSMENT' OR assessment_id IS NOT NULL),
  CHECK (source <> 'STAFF' OR created_by IS NOT NULL)
) STRICT;

CREATE INDEX property_events_by_business ON property_events (business_id, property_id, ord);

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
                                           'works_repairs','works_prelims','works_fees')),
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
  CHECK (field NOT IN ('insurance_includes','rebuild_includes') OR value IS NULL OR value BETWEEN 0 AND 7),
  -- Phase 159c: a works value is money, at most £1bn, as every other amount in the pack.
  CHECK (field NOT GLOB 'works_*' OR value IS NULL OR value <= 100000000000)
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

UPDATE document_types
   SET label = 'Final account, or the contractor''s cost breakdown by element',
       note = note || ' Phase 159c (9 October 2026): relabelled, because on a finished job this breakdown is the final account, and the cost-led pack is priced from it.',
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE code = 'CONTRACTOR_COST_BREAKDOWN';

CREATE TABLE _fk_check_guard (ok INTEGER NOT NULL CHECK (ok = 0)) STRICT;
INSERT INTO _fk_check_guard (ok) SELECT count(*) FROM pragma_foreign_key_check;
DROP TABLE _fk_check_guard;

COMMIT;

PRAGMA foreign_keys = ON;
