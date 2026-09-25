-- ===========================================================================
-- 054 — TAKING BACK A PICK, OR A YES.                                  Phase 146j, 25 September 2026
--
-- Phases 146h and 146i each built a decision a person makes, and each built it as a one-way door. This migration
-- gives both a way back, in the shape Phase 139 already uses for a fact somebody ticked: a separate act, which ASKS
-- WHY and keeps the reason. A decision that was made and reversed is two facts, not none, so nothing here deletes
-- the decision. What it takes back is the one thing the decision put into the claim file.
--
-- ---------------------------------------------------------------------------------------------------------------
-- 1 · register_match_picks — A PICK THAT IS TAKEN BACK STAYS, WITH WHY AND WHO.
--
-- Migration 042 kept one pick per client per lookup, and a later one REPLACED it by deleting the row. That was right
-- while the only way back was "choose again", and it is wrong the moment a pick can be taken back: the next pick on
-- the same lookup would delete the row that says the first one was wrong. So the UNIQUE (business_id, source_id)
-- becomes a partial unique index over the picks that STAND, and a taken-back pick is never replaced or deleted.
--
--   taken_back_at / _by / _reason   who took it back, when, and why in their own words. All three or none.
--   removed_record_id               the register_records row the pick had written and taking it back removed. It is
--                                   NOT a foreign key, on purpose: the row it names is gone, and a foreign key to a
--                                   deleted row is a violation rather than a record. `record_id` is set to NULL at the
--                                   same moment, so the foreign key that does exist never points at nothing.
--   look_again_json                 what was worked out FROM the record while it stood, as kinds and counts — never a
--                                   value, a name or an address. Taking a pick back does not un-derive any of it
--                                   silently; this is the list a person must look at again.
--
-- ---------------------------------------------------------------------------------------------------------------
-- 2 · document_field_vouches — THE ANSWER CAN BE GIVEN BEFORE THE FIRST READING, AND A YES CAN BE TAKEN BACK.
--
-- ASKED EARLIER, AND STILL ONE STORE. Migration 043 asked on the document's own page, which exists only once the file
-- has been read and deleted, so the first reading of a grant funding agreement always left the funder's name out.
-- The staff upload form and the document request now ask it where the type is chosen. The upload form writes the
-- row against the document it creates. A request has no document yet, so its answer is written against the REQUEST
-- and the SAME ROW is adopted by the document that answers it, before that document is read: logical_document_id is
-- filled in, and request_id stays to say where the answer was first given. There is no second table and nothing
-- reads a request's answer except that adoption. Where the document already has an answer, the document's answer
-- governs and the request's is not adopted.
--
--   asked_on        'PAGE' | 'UPLOAD' | 'REQUEST' — where the answer that stands was given. Every row before this
--                   migration was given on the page.
--   withdrawn_*     a 'yes' taken back, with who, when and why. Only a 'yes' can be withdrawn: it is the only answer
--                   that ever kept anything. A withdrawn 'yes' keeps nothing, exactly as 'no' does (N4), and the row
--                   still says it was a yes, so "we said yes and took it back" is not flattened into "we said no".
--
-- A CHECK CAN ONLY BE CHANGED BY REBUILDING THE TABLE (sqlite.org, "Making Other Kinds Of Table Schema Changes"),
-- as migrations 007, 049 and 053 do. Nothing references either table, and neither carries a trigger; each has one
-- index, put back below.
-- ===========================================================================

-- 1 · foreign keys off. A no-op inside a transaction, so it goes FIRST.
PRAGMA foreign_keys = OFF;

-- 2 · one transaction. All of it, or none of it.
BEGIN;

-- 3, 4 · register_match_picks, 042's columns and constraints and the take-back columns.
CREATE TABLE register_match_picks_new (
  id                 TEXT PRIMARY KEY,
  business_id        TEXT NOT NULL REFERENCES businesses(id),
  source_id          TEXT NOT NULL,
  chosen_key         TEXT,
  score              REAL,
  grade              TEXT CHECK (grade IN ('A','B','C','D','E')),
  record_id          TEXT REFERENCES register_records(id),
  picked_by          TEXT NOT NULL REFERENCES users(id),
  picked_at          TEXT NOT NULL,
  taken_back_at      TEXT,
  taken_back_by      TEXT REFERENCES users(id),
  taken_back_reason  TEXT CHECK (taken_back_reason IS NULL OR length(trim(taken_back_reason)) BETWEEN 1 AND 2000),
  removed_record_id  TEXT,
  look_again_json    TEXT CHECK (look_again_json IS NULL OR (json_valid(look_again_json) AND json_type(look_again_json) = 'array')),
  -- Taken back is all three facts or none of them.
  CHECK ((taken_back_at IS NULL) = (taken_back_by IS NULL) AND (taken_back_at IS NULL) = (taken_back_reason IS NULL)),
  -- Only a pick that chose something can be taken back: "none of them" wrote nothing and is replaced by choosing again.
  CHECK (taken_back_at IS NULL OR chosen_key IS NOT NULL),
  -- A pick taken back points at no record any more.
  CHECK (taken_back_at IS NULL OR record_id IS NULL)
) STRICT;

-- 5 · copy, columns named on both sides.
INSERT INTO register_match_picks_new (id, business_id, source_id, chosen_key, score, grade, record_id, picked_by, picked_at)
SELECT id, business_id, source_id, chosen_key, score, grade, record_id, picked_by, picked_at FROM register_match_picks;

-- 6, 7 · drop and rename; then put back what hung off the old table, and the one standing pick per lookup.
DROP TABLE register_match_picks;
ALTER TABLE register_match_picks_new RENAME TO register_match_picks;

CREATE UNIQUE INDEX register_match_picks_standing ON register_match_picks (business_id, source_id) WHERE taken_back_at IS NULL;
CREATE INDEX register_match_picks_by_person ON register_match_picks (picked_by, picked_at);

-- 3, 4 · document_field_vouches, 043's columns and constraints, keyed on a document OR a request, and withdrawable.
CREATE TABLE document_field_vouches_new (
  id                   TEXT PRIMARY KEY,
  logical_document_id  TEXT REFERENCES logical_documents(id),
  request_id           TEXT REFERENCES client_tasks(id),
  field_id             TEXT NOT NULL,
  answer               TEXT NOT NULL CHECK (answer IN ('yes','no','not_sure')),
  answered_by          TEXT NOT NULL REFERENCES users(id),
  answered_at          TEXT NOT NULL,
  asked_on             TEXT NOT NULL DEFAULT 'PAGE' CHECK (asked_on IN ('PAGE','UPLOAD','REQUEST')),
  withdrawn_at         TEXT,
  withdrawn_by         TEXT REFERENCES users(id),
  withdrawn_reason     TEXT CHECK (withdrawn_reason IS NULL OR length(trim(withdrawn_reason)) BETWEEN 1 AND 2000),
  -- An answer is about a document, or about the document a request asks for. Never about nothing.
  CHECK (logical_document_id IS NOT NULL OR request_id IS NOT NULL),
  -- A request's answer was given on the request.
  CHECK (request_id IS NULL OR asked_on = 'REQUEST'),
  -- Withdrawn is all three facts or none, and only a yes is ever withdrawn.
  CHECK ((withdrawn_at IS NULL) = (withdrawn_by IS NULL) AND (withdrawn_at IS NULL) = (withdrawn_reason IS NULL)),
  CHECK (withdrawn_at IS NULL OR answer = 'yes'),
  UNIQUE (logical_document_id, field_id),
  UNIQUE (request_id, field_id)
) STRICT;

INSERT INTO document_field_vouches_new (id, logical_document_id, request_id, field_id, answer, answered_by, answered_at, asked_on)
SELECT id, logical_document_id, NULL, field_id, answer, answered_by, answered_at, 'PAGE' FROM document_field_vouches;

DROP TABLE document_field_vouches;
ALTER TABLE document_field_vouches_new RENAME TO document_field_vouches;

CREATE INDEX document_field_vouches_by_person ON document_field_vouches (answered_by, answered_at);

-- 8 · THE GUARD. Zero foreign-key violations, or this migration does not happen at all.
CREATE TABLE _fk_check_guard (ok INTEGER NOT NULL CHECK (ok = 0)) STRICT;
INSERT INTO _fk_check_guard (ok) SELECT count(*) FROM pragma_foreign_key_check;
DROP TABLE _fk_check_guard;

-- 9 · commit.
COMMIT;

-- 10 · and back on.
PRAGMA foreign_keys = ON;
