-- ===========================================================================
-- 055 — THE TITLE REGISTER, BY HAND.                                   Phase 146k, 25 September 2026
--
-- Lakhbir, 25 September 2026: HM Land Registry's title register "will be done manually and not via API", and the
-- Business Gateway details were taken out of the key file. So the paid lookup Phase 146d built (src/connectors/
-- hmlr-title.ts) is retired from "Run the research", and a person who has bought the official copy records what it
-- says on the property page (src/web/title-by-hand.ts).
--
-- WHAT THEY RECORD GOES IN THROUGH THE ONE DOOR, as a register record like any other (source HMLR_TITLE, entity
-- "by-hand:<title number>"), so the name exclusion register checks it and every reader of register records — the
-- checks panel, the surveyor's payload with the price withheld, the retention clock — reads it unchanged. This table is
-- the record of the PERSON's act: who typed it, when, and, if it was taken back, who, when and why. One entry stands
-- per property; one taken back is kept, never replaced, the same way migration 054 keeps a pick taken back.
--
--   record_id          the register_records row this entry wrote. NULL once taken back, when that row is removed.
--   removed_record_id  the row taking it back removed. NOT a foreign key: the row it names is gone.
--   title_number       the title it is for — a register reference, not a name.
--   look_again_json    what was worked out from the record while it stood, as kinds and counts (src/web/take-back.ts).
-- ===========================================================================

CREATE TABLE title_by_hand (
  id                 TEXT PRIMARY KEY,
  business_id        TEXT NOT NULL REFERENCES businesses(id),
  property_id        TEXT NOT NULL REFERENCES properties(id),
  record_id          TEXT REFERENCES register_records(id),
  removed_record_id  TEXT,
  title_number       TEXT NOT NULL CHECK (length(title_number) BETWEEN 1 AND 12),
  recorded_by        TEXT NOT NULL REFERENCES users(id),
  recorded_at        TEXT NOT NULL,
  taken_back_at      TEXT,
  taken_back_by      TEXT REFERENCES users(id),
  taken_back_reason  TEXT CHECK (taken_back_reason IS NULL OR length(trim(taken_back_reason)) BETWEEN 1 AND 2000),
  look_again_json    TEXT CHECK (look_again_json IS NULL OR (json_valid(look_again_json) AND json_type(look_again_json) = 'array')),
  CHECK ((taken_back_at IS NULL) = (taken_back_by IS NULL) AND (taken_back_at IS NULL) = (taken_back_reason IS NULL)),
  -- Standing, it points at its record; taken back, at none.
  CHECK ((taken_back_at IS NULL) = (record_id IS NOT NULL))
) STRICT;

CREATE UNIQUE INDEX title_by_hand_standing ON title_by_hand (property_id) WHERE taken_back_at IS NULL;
CREATE INDEX title_by_hand_by_business ON title_by_hand (business_id, recorded_at);
