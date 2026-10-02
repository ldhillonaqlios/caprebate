-- ===========================================================================
-- 071 — THE SURVEY PACK'S LEGAL CHECK: THE ANSWERS, EACH WITH WHO GAVE IT AND WHERE IT CAME FROM
-- 2 October 2026. src/web/pack-legal.ts.
--
-- Lakhbir agreed (1 Oct 2026) that the legal check comes before the survey: on a building bought since April 2014, the
-- fixtures can be worth nothing to the buyer unless the seller's position was fixed — a section 198 election, or a
-- tribunal application, within two years (CAA 2001 s.187A). The questions are the engine's own (CB_S187A.questions and
-- the sector's election questions); the answers are kept here, and the engine's own assessments read them.
--
-- NEVER EDITED, NEVER DELETED. A changed answer is a new row; the newest row for a question is the answer. Each row says
-- who gave it and where it came from (the election notice, the CPSE replies, the client), because "not known" is never
-- a pass and an answer with no source is not evidence.
-- ===========================================================================

CREATE TABLE survey_pack_legal_answers (
  id           TEXT PRIMARY KEY,
  pack_id      TEXT NOT NULL REFERENCES survey_packs(id),
  -- The legal check's own counter, so an answer from an out-of-date page is refused (as the pack's changes are).
  seq          INTEGER NOT NULL CHECK (seq >= 1),
  -- The engine's question id, for example 'G14' or 'Q14po'.
  question_id  TEXT NOT NULL CHECK (length(question_id) BETWEEN 1 AND 20),
  -- The answer as the engine takes it, as JSON: an option's key, a list of keys, a date, an amount in pounds.
  value_json   TEXT NOT NULL CHECK (length(value_json) BETWEEN 1 AND 2000 AND json_valid(value_json)),
  by_user      TEXT NOT NULL REFERENCES users(id),
  source_note  TEXT NOT NULL CHECK (length(trim(source_note)) BETWEEN 1 AND 300),
  at           TEXT NOT NULL,
  UNIQUE (pack_id, seq)
) STRICT;

CREATE INDEX survey_pack_legal_answers_by_question ON survey_pack_legal_answers (pack_id, question_id, seq);

CREATE TRIGGER survey_pack_legal_answers_never_edited BEFORE UPDATE ON survey_pack_legal_answers
BEGIN SELECT RAISE(ABORT, 'a legal check answer is never edited: give a new one'); END;
CREATE TRIGGER survey_pack_legal_answers_never_deleted BEFORE DELETE ON survey_pack_legal_answers
BEGIN SELECT RAISE(ABORT, 'a legal check answer is never deleted'); END;
