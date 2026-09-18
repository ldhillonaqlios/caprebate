-- ===========================================================================
-- 004 — settings, the profile photo, and the calendar.   Phase 105, 8 Sep 2026
--
-- Three things, and the third is a correction rather than an addition.
--
-- 1. PROFILE PHOTOS. One row per user, holding the STORE KEY and never bytes.
-- 2. BOOKING ASSIGNMENT HISTORY, so "move one and both views change" is a fact
--    with a record behind it rather than an assertion about a screen.
-- 3. `businesses.preferred_contact` — A FOURTH CONTACT VOCABULARY, RETIRED.
--
-- Migration 002 declared  preferred_contact IN ('email','telephone','virtual','post').
-- CB_BOOKING's channels are 'phone', 'sms_whatsapp' and 'email'. So that column
-- could hold 'virtual' — which is VIDEO, deliberately removed on 3 September
-- 2026 (Phases 69-71) — and 'post', which was never a channel at all. Both are
-- values no client can choose, and BOTH ARE IN THE SEED, so a staff screen
-- built to show "how did they ask to be contacted" would have displayed
-- "virtual" for an invented client and a developer reading the seed as the
-- schema would have rebuilt video.
--
-- src/web/assessment.ts already saw half of this: its `preferredContact()`
-- carries a comment calling the column "a FOURTH vocabulary" and quietly maps
-- CB_BOOKING's ids onto it. Mapping between two vocabularies is what keeps both
-- alive. This migration ends the second one.
--
-- Section 3 below records how that was fixed, why the obvious fix does not
-- work in SQLite, and what was done instead. Read it before touching the
-- column: the reasoning matters more than the four statements it produced.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · PROFILE PHOTOS
--
-- THE BYTES ARE NOT HERE. `storage_key` names an object in the same hardened
-- store that holds client documents — outside the web root, mode 0600, no
-- execute bit — and is served only through an endpoint that authorises the
-- request. A photo in the database is a photo in every backup, every dump and
-- every screenshot of a query result.
--
-- `sniffed_as` and `byte_size` are recorded AFTER re-encoding, so they describe
-- what we actually store rather than what was sent. The original never reaches
-- durable storage: src/web/avatar.ts decodes it to pixels and writes a new
-- file from those pixels, which is what drops every ancillary chunk a PNG can
-- carry — text, colour profiles, EXIF, and anything appended after IEND.
-- ---------------------------------------------------------------------------
CREATE TABLE user_photos (
  user_id      TEXT PRIMARY KEY REFERENCES users(id),
  storage_key  TEXT NOT NULL,
  -- What the RE-ENCODED file is. Always 'png' today; a column rather than a
  -- constant because the allow-list is data and may widen.
  sniffed_as   TEXT NOT NULL,
  byte_size    INTEGER NOT NULL,
  width        INTEGER NOT NULL,
  height       INTEGER NOT NULL,
  -- The format of the file the client SENT, before re-encoding. Kept because
  -- "we accepted a JPEG and stored a PNG" is a fact about provenance.
  source_format TEXT NOT NULL,
  source_bytes  INTEGER NOT NULL,
  updated_at   TEXT NOT NULL
) STRICT;

-- ---------------------------------------------------------------------------
-- 2 · BOOKINGS GAIN A TIME, AN OWNER AND A HISTORY
--
-- Migration 003 rebuilt `bookings` onto CB_BOOKING's channels and left
-- `starts_at` nullable, because only 'phone' books a moment. It already has
-- `assigned_to`. What it has no record of is CHANGE: who scheduled a request,
-- who moved it, and from when to when.
--
-- The phase brief asks for this in terms — "move one, and show both views
-- change" — and a screen that changes proves the render, not the record.
-- ---------------------------------------------------------------------------
CREATE TABLE booking_changes (
  id            TEXT PRIMARY KEY,
  booking_id    TEXT NOT NULL REFERENCES bookings(id),
  changed_by    TEXT NOT NULL REFERENCES users(id),
  -- What moved. Both sides recorded, both nullable, because scheduling a
  -- request that had no time is a move FROM nothing and is the common case.
  from_starts_at TEXT,
  to_starts_at   TEXT,
  from_assigned  TEXT REFERENCES users(id),
  to_assigned    TEXT REFERENCES users(id),
  at            TEXT NOT NULL
) STRICT;

CREATE INDEX booking_changes_booking_idx ON booking_changes(booking_id, at);

-- ---------------------------------------------------------------------------
-- 3 · THE FOURTH CONTACT VOCABULARY, RETIRED — AND IT IS RETIRED, NOT NARROWED
--
-- THE FIRST ATTEMPT AT THIS WAS WRONG AND THE DATABASE SAID SO, WHICH IS WHY
-- THE REASONING IS HERE RATHER THAN THE OUTCOME ALONE.
--
-- The plan was to narrow the column onto CB_BOOKING's three ids ('phone',
-- 'sms_whatsapp', 'email') with triggers, avoiding a table rebuild. It cannot
-- be done: migration 002's own CHECK allows only ('email','telephone',
-- 'virtual','post'), a trigger can only make a column STRICTER, and 'phone' and
-- 'sms_whatsapp' are not in that set. A trigger narrowing and a CHECK widening
-- cannot meet. The seed failed on the first run and named the constraint.
--
-- Rebuilding the table is the documented way to change a CHECK. THIRTEEN TABLES
-- carry a foreign key into `businesses`, so that is a twelve-step procedure with
-- foreign keys disabled, for a column that holds a copy of something already
-- recorded elsewhere. NOT WORTH THE RISK, AND NOT NECESSARY.
--
-- SO THE COLUMN IS ENDED INSTEAD OF CORRECTED. `bookings` already holds the
-- channel the client chose, in CB_BOOKING's own vocabulary, with the entry
-- point and the variant beside it. It is written by the funnel close and read
-- by the staff assessment list, the calendar and the client's own portal.
-- THAT IS THE ONE SOURCE. `businesses.preferred_contact` was a second copy of
-- it in a vocabulary that could express things no client can choose.
--
-- Every value is set to NULL and the triggers below refuse ANY value at all.
-- Not "refuse the wrong ones" — refuse all of them, so a future writer gets an
-- error naming the table that owns this fact rather than a column that silently
-- accepts a word nothing reads.
--
-- WHAT IS LOST: nothing that was true. 'virtual' is VIDEO, removed on
-- 3 September 2026; 'post' was never a channel; 'telephone' and 'email' are
-- duplicates of the booking row written in the same request. The seed carried
-- 'virtual' and 'post' on two of its six businesses, so a staff screen reading
-- this column would have shown a channel no client can pick.
--
-- THE COLUMN ITSELF STAYS until something rebuilds the table: SQLite refuses
-- DROP COLUMN on a column named in a table CHECK, which this one is. It is
-- inert, it is enforced inert, and removing the last of it is JOB 3 OF PHASE
-- 113a in the action plan -- which is also told to leave these triggers in
-- place and say so if the rebuild does not come out clean, because a dead
-- column nothing can write to is a far smaller problem than a botched rebuild
-- of the table every other table points at.
-- ---------------------------------------------------------------------------
UPDATE businesses SET preferred_contact = NULL WHERE preferred_contact IS NOT NULL;

CREATE TRIGGER businesses_contact_retired_insert
BEFORE INSERT ON businesses
WHEN NEW.preferred_contact IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'businesses.preferred_contact is retired (migration 004). The contact channel lives on the booking row, in CB_BOOKING''s vocabulary. Write it there.');
END;

CREATE TRIGGER businesses_contact_retired_update
BEFORE UPDATE OF preferred_contact ON businesses
WHEN NEW.preferred_contact IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'businesses.preferred_contact is retired (migration 004). The contact channel lives on the booking row, in CB_BOOKING''s vocabulary. Write it there.');
END;
