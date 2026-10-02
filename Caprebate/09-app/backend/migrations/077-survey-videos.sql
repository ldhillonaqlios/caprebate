-- ===========================================================================
-- 077 — A VIDEO OF THE BUILDING, SENT FROM THE PHONE IN LOCKED PIECES
-- 2 October 2026. src/web/survey-video.ts, src/web/photo-upload-script.ts.
--
-- Lakhbir, 2 Oct 2026: "we need to add an option of upload video"; the redesign as mocked up, with "I don't have this"
-- on the checklist; asked the limits: "10 minutes, 1 GB each"; asked how videos are kept: "Same as photos" (locked on
-- the phone, location removed, encrypted, kept for testing 7 years, seen by the client, the surveyor, Admin, Sales and
-- the data protection officer).
--
-- A video is sent in pieces of 4 MB, each locked on the phone (as a photo is: src/web/photo-upload.ts) and sent straight
-- to the file store, or through our own route when the store gives no address. Each piece is opened and kept ENCRYPTED
-- with the store's key under survey-videos/<video>/<n>; the locked piece is removed. When every piece has come, the
-- video is checked (an MP4 or QuickTime file, at most ten minutes), the place it was filmed is blanked out, and it is
-- kept. It is played back in pieces, never whole.
--
--   survey_video_sends      one video being sent: the job, who, "nobody is in it", the note, its size and how many
--                           pieces, the one-time lock's public half and its private half (itself encrypted).
--   survey_video_slots      one piece's place in the store, given to the phone.
--   survey_video_pieces     a piece that came and was kept encrypted: its plain size and SHA-256.
--   survey_video_outcomes   what became of the send: KEPT, REFUSED (why) or ABANDONED.
--   survey_videos           a kept video: its type, size, length, pieces, note, who and when. Its id is its send's.
--   survey_video_withdrawals  a video taken back, with why. It is then shown to nobody.
-- None is ever edited or deleted.
-- ===========================================================================

CREATE TABLE survey_video_sends (
  id                  TEXT PRIMARY KEY,
  job_id              TEXT NOT NULL REFERENCES surveyor_jobs(id),
  by_user             TEXT NOT NULL REFERENCES users(id),
  byte_size           INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 1073741824),
  pieces              INTEGER NOT NULL CHECK (pieces BETWEEN 1 AND 256),
  note                TEXT CHECK (note IS NULL OR length(trim(note)) BETWEEN 1 AND 500),
  nobody_in_it        INTEGER NOT NULL CHECK (nobody_in_it = 1),
  public_key          TEXT NOT NULL CHECK (length(public_key) BETWEEN 100 AND 1000),
  private_key_sealed  TEXT NOT NULL CHECK (length(private_key_sealed) BETWEEN 100 AND 4000),
  created_at          TEXT NOT NULL,
  expires_at          TEXT NOT NULL
) STRICT;
CREATE INDEX survey_video_sends_by_job ON survey_video_sends (job_id, created_at);

CREATE TABLE survey_video_slots (
  id          TEXT PRIMARY KEY,
  send_id     TEXT NOT NULL REFERENCES survey_video_sends(id),
  n           INTEGER NOT NULL CHECK (n BETWEEN 1 AND 256),
  staged_key  TEXT NOT NULL UNIQUE CHECK (staged_key GLOB 'survey-incoming/*'),
  byte_size   INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 4400000),
  issued_at   TEXT NOT NULL,
  UNIQUE (send_id, n)
) STRICT;
CREATE INDEX survey_video_slots_by_issued ON survey_video_slots (issued_at);

CREATE TABLE survey_video_pieces (
  send_id    TEXT NOT NULL REFERENCES survey_video_sends(id),
  n          INTEGER NOT NULL CHECK (n BETWEEN 1 AND 256),
  slot_id    TEXT NOT NULL UNIQUE REFERENCES survey_video_slots(id),
  byte_size  INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 4194304),
  sha256     TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  at         TEXT NOT NULL,
  PRIMARY KEY (send_id, n)
) STRICT;

CREATE TABLE survey_video_outcomes (
  send_id   TEXT PRIMARY KEY REFERENCES survey_video_sends(id),
  outcome   TEXT NOT NULL CHECK (outcome IN ('KEPT', 'REFUSED', 'ABANDONED')),
  why       TEXT CHECK (why IS NULL OR length(trim(why)) BETWEEN 1 AND 300),
  at        TEXT NOT NULL,
  CHECK ((outcome = 'KEPT') = (why IS NULL))
) STRICT;

CREATE TABLE survey_videos (
  id            TEXT PRIMARY KEY REFERENCES survey_video_sends(id),
  job_id        TEXT NOT NULL REFERENCES surveyor_jobs(id),
  content_type  TEXT NOT NULL CHECK (content_type IN ('video/mp4', 'video/quicktime')),
  byte_size     INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 1073741824),
  duration_ms   INTEGER NOT NULL CHECK (duration_ms BETWEEN 0 AND 605000),
  pieces        INTEGER NOT NULL CHECK (pieces BETWEEN 1 AND 256),
  places_blanked INTEGER NOT NULL CHECK (places_blanked >= 0),
  note          TEXT CHECK (note IS NULL OR length(trim(note)) BETWEEN 1 AND 500),
  taken_by      TEXT NOT NULL REFERENCES users(id),
  taken_at      TEXT NOT NULL,
  nobody_in_it  INTEGER NOT NULL CHECK (nobody_in_it = 1)
) STRICT;
CREATE INDEX survey_videos_by_job ON survey_videos (job_id, taken_at);

CREATE TABLE survey_video_withdrawals (
  video_id  TEXT PRIMARY KEY REFERENCES survey_videos(id),
  by_user   TEXT NOT NULL REFERENCES users(id),
  reason    TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 300),
  at        TEXT NOT NULL
) STRICT;

CREATE TRIGGER survey_video_sends_never_edited BEFORE UPDATE ON survey_video_sends BEGIN SELECT RAISE(ABORT, 'a video send is never edited'); END;
CREATE TRIGGER survey_video_sends_never_deleted BEFORE DELETE ON survey_video_sends BEGIN SELECT RAISE(ABORT, 'a video send is never deleted'); END;
CREATE TRIGGER survey_video_slots_never_edited BEFORE UPDATE ON survey_video_slots BEGIN SELECT RAISE(ABORT, 'a slot is never edited'); END;
CREATE TRIGGER survey_video_slots_never_deleted BEFORE DELETE ON survey_video_slots BEGIN SELECT RAISE(ABORT, 'a slot is never deleted'); END;
CREATE TRIGGER survey_video_pieces_never_edited BEFORE UPDATE ON survey_video_pieces BEGIN SELECT RAISE(ABORT, 'a piece is never edited'); END;
CREATE TRIGGER survey_video_pieces_never_deleted BEFORE DELETE ON survey_video_pieces BEGIN SELECT RAISE(ABORT, 'a piece is never deleted'); END;
CREATE TRIGGER survey_video_outcomes_never_edited BEFORE UPDATE ON survey_video_outcomes BEGIN SELECT RAISE(ABORT, 'an outcome is never edited'); END;
CREATE TRIGGER survey_video_outcomes_never_deleted BEFORE DELETE ON survey_video_outcomes BEGIN SELECT RAISE(ABORT, 'an outcome is never deleted'); END;
CREATE TRIGGER survey_videos_never_edited BEFORE UPDATE ON survey_videos BEGIN SELECT RAISE(ABORT, 'a video is never edited'); END;
CREATE TRIGGER survey_videos_never_deleted BEFORE DELETE ON survey_videos BEGIN SELECT RAISE(ABORT, 'a video is never deleted here: withdraw it'); END;
CREATE TRIGGER survey_video_withdrawals_never_edited BEFORE UPDATE ON survey_video_withdrawals BEGIN SELECT RAISE(ABORT, 'a withdrawal is never edited'); END;
CREATE TRIGGER survey_video_withdrawals_never_deleted BEFORE DELETE ON survey_video_withdrawals BEGIN SELECT RAISE(ABORT, 'a withdrawal is never deleted'); END;
