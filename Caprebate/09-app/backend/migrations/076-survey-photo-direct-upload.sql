-- ===========================================================================
-- 076 — FULL-SIZE PHOTOS, SENT STRAIGHT TO THE FILE STORE, LOCKED ON THE PHONE
-- 2 October 2026. src/web/photo-upload.ts, src/web/photo-upload-script.ts.
--
-- Lakhbir, 2 Oct 2026, asked whether the test website's 4.5 MB a send can be raised (it cannot: it is Vercel's fixed
-- limit on a request to the website): "go with option 2" — each photo sent from the phone straight to the private file
-- store; asked how it travels: "Lock on the phone"; the limits: "100 photos, 25 MB each"; the mock-up: "Yes, build it
-- as shown".
--
-- WHY A REBUILD. survey_photos (migration 074) allows a photo of at most 4,500,000 bytes, and SQLite cannot widen a
-- CHECK in place. The table is rebuilt with the limit at 25 MB (26,214,400 bytes), every row copied as it is, and its
-- index and two triggers made again word for word. Nothing else names survey_photos in a trigger or a view; the tables
-- that point at it (survey_photo_withdrawals, survey_photo_sorts) keep pointing at it by name. The guard at the foot
-- proves no foreign key broke.
--
--   survey_upload_sessions   one "send lots of photos" from the phone: the job, who, "nobody is in them", the note, how
--                            many photos, and the one-time lock's two halves — the public half the phone locks with,
--                            and the private half that opens it, ITSELF ENCRYPTED with the store's key.
--   survey_upload_slots      one photo's place to go in the file store, given to the phone: where, and how big locked.
--   survey_upload_outcomes   what became of it: KEPT (the photo it became), REFUSED (why), or ABANDONED (never finished;
--                            cleared by the sweep). Once each.
-- None is ever edited or deleted.
-- ===========================================================================

-- 1 · foreign keys off. A no-op inside a transaction, so it goes FIRST.
PRAGMA foreign_keys = OFF;

-- 2 · one transaction. All of it, or none of it.
BEGIN;

-- 3 · survey_photos, rebuilt with the 25 MB limit.
CREATE TABLE survey_photos_new (
  id            TEXT PRIMARY KEY,
  job_id        TEXT NOT NULL REFERENCES surveyor_jobs(id),
  item_key      TEXT NOT NULL CHECK (length(item_key) BETWEEN 2 AND 60 AND item_key NOT GLOB '*[^A-Z0-9-]*'),
  object_key    TEXT NOT NULL UNIQUE CHECK (object_key GLOB 'survey-photos/*'),
  content_type  TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png')),
  byte_size     INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 26214400),
  sha256        TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  note          TEXT CHECK (note IS NULL OR length(trim(note)) BETWEEN 1 AND 500),
  taken_by      TEXT NOT NULL REFERENCES users(id),
  taken_at      TEXT NOT NULL,
  nobody_in_it  INTEGER NOT NULL CHECK (nobody_in_it = 1)
) STRICT;
INSERT INTO survey_photos_new (id, job_id, item_key, object_key, content_type, byte_size, sha256, note, taken_by, taken_at, nobody_in_it)
  SELECT id, job_id, item_key, object_key, content_type, byte_size, sha256, note, taken_by, taken_at, nobody_in_it FROM survey_photos;
DROP TABLE survey_photos;
ALTER TABLE survey_photos_new RENAME TO survey_photos;
CREATE INDEX survey_photos_by_job ON survey_photos (job_id, item_key, taken_at);
CREATE TRIGGER survey_photos_never_edited BEFORE UPDATE ON survey_photos BEGIN SELECT RAISE(ABORT, 'a photo is never edited'); END;
CREATE TRIGGER survey_photos_never_deleted BEFORE DELETE ON survey_photos BEGIN SELECT RAISE(ABORT, 'a photo is never deleted here: withdraw it'); END;

-- 4 · the sends straight to the store.
CREATE TABLE survey_upload_sessions (
  id                  TEXT PRIMARY KEY,
  job_id              TEXT NOT NULL REFERENCES surveyor_jobs(id),
  by_user             TEXT NOT NULL REFERENCES users(id),
  photos_planned      INTEGER NOT NULL CHECK (photos_planned BETWEEN 1 AND 100),
  note                TEXT CHECK (note IS NULL OR length(trim(note)) BETWEEN 1 AND 500),
  nobody_in_it        INTEGER NOT NULL CHECK (nobody_in_it = 1),
  public_key          TEXT NOT NULL CHECK (length(public_key) BETWEEN 100 AND 1000),
  private_key_sealed  TEXT NOT NULL CHECK (length(private_key_sealed) BETWEEN 100 AND 4000),
  created_at          TEXT NOT NULL,
  expires_at          TEXT NOT NULL
) STRICT;
CREATE INDEX survey_upload_sessions_by_job ON survey_upload_sessions (job_id, created_at);

CREATE TABLE survey_upload_slots (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES survey_upload_sessions(id),
  n           INTEGER NOT NULL CHECK (n BETWEEN 1 AND 100),
  staged_key  TEXT NOT NULL UNIQUE CHECK (staged_key GLOB 'survey-incoming/*'),
  byte_size   INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 26215424),
  issued_at   TEXT NOT NULL,
  UNIQUE (session_id, n)
) STRICT;
CREATE INDEX survey_upload_slots_by_issued ON survey_upload_slots (issued_at);

CREATE TABLE survey_upload_outcomes (
  slot_id   TEXT PRIMARY KEY REFERENCES survey_upload_slots(id),
  outcome   TEXT NOT NULL CHECK (outcome IN ('KEPT', 'REFUSED', 'ABANDONED')),
  photo_id  TEXT REFERENCES survey_photos(id),
  why       TEXT CHECK (why IS NULL OR length(trim(why)) BETWEEN 1 AND 300),
  at        TEXT NOT NULL,
  CHECK ((outcome = 'KEPT') = (photo_id IS NOT NULL)),
  CHECK ((outcome = 'KEPT') = (why IS NULL))
) STRICT;

CREATE TRIGGER survey_upload_sessions_never_edited BEFORE UPDATE ON survey_upload_sessions BEGIN SELECT RAISE(ABORT, 'a send is never edited'); END;
CREATE TRIGGER survey_upload_sessions_never_deleted BEFORE DELETE ON survey_upload_sessions BEGIN SELECT RAISE(ABORT, 'a send is never deleted'); END;
CREATE TRIGGER survey_upload_slots_never_edited BEFORE UPDATE ON survey_upload_slots BEGIN SELECT RAISE(ABORT, 'a slot is never edited'); END;
CREATE TRIGGER survey_upload_slots_never_deleted BEFORE DELETE ON survey_upload_slots BEGIN SELECT RAISE(ABORT, 'a slot is never deleted'); END;
CREATE TRIGGER survey_upload_outcomes_never_edited BEFORE UPDATE ON survey_upload_outcomes BEGIN SELECT RAISE(ABORT, 'an outcome is never edited'); END;
CREATE TRIGGER survey_upload_outcomes_never_deleted BEFORE DELETE ON survey_upload_outcomes BEGIN SELECT RAISE(ABORT, 'an outcome is never deleted'); END;

-- 5 · the guard: no foreign key broke.
CREATE TABLE _fk_check_guard (ok INTEGER NOT NULL CHECK (ok = 0)) STRICT;
INSERT INTO _fk_check_guard (ok) SELECT count(*) FROM pragma_foreign_key_check;
DROP TABLE _fk_check_guard;

COMMIT;

-- 6 · foreign keys back on, after the transaction.
PRAGMA foreign_keys = ON;
