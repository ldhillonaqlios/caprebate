-- ===========================================================================
-- 087 — THE SURVEYOR'S OWN WORDS IN THE SURVEY PACK   Phase 153g, 4 October 2026
--
-- Chapters 5, 8, 11, 14, 16, 19, 20 and 22 of the survey pack ask the surveyor for words, not a number: the building's
-- construction type, how a dwelling split was drawn, the comparables behind the bare land value, the basis of each
-- qualifying percentage, a disposal value, the sector's distinctive judgement, the physical scope of works seen, and the
-- four prompts of the narrative (src/web/pack-words.ts). One row per change, with the surveyor's reason, under their
-- name; the newest row for a field is the one shown, and an empty one clears it. None is ever edited or deleted. An
-- approved version keeps its own copy (its JSON), so a later change never alters a report already approved.
-- ===========================================================================

CREATE TABLE survey_pack_words (
  id       TEXT PRIMARY KEY,
  pack_id  TEXT NOT NULL REFERENCES survey_packs(id),
  field    TEXT NOT NULL CHECK (field IN ('construction_type','build_year','building_other','dwelling_method','dwelling_segregation',
             'land_comparables','land_voa','land_date','land_planning_basis','qpct_basis','disposal_value','sector_core',
             'works_scope','narrative_description','narrative_condition','narrative_departures','narrative_opinion')),
  -- NULL clears the field (the chapter says "not written yet" again).
  words    TEXT CHECK (words IS NULL OR length(trim(words)) BETWEEN 1 AND 4000),
  by_user  TEXT NOT NULL REFERENCES users(id),
  reason   TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  at       TEXT NOT NULL
) STRICT;
CREATE INDEX survey_pack_words_by_field ON survey_pack_words (pack_id, field, at);

CREATE TRIGGER survey_pack_words_never_edited BEFORE UPDATE ON survey_pack_words
BEGIN SELECT RAISE(ABORT, 'the surveyor''s words are never edited: add a new row'); END;
CREATE TRIGGER survey_pack_words_never_deleted BEFORE DELETE ON survey_pack_words
BEGIN SELECT RAISE(ABORT, 'the surveyor''s words are never deleted'); END;
