-- ===========================================================================
-- 074 — THE SURVEY'S EVIDENCE FROM THE CLIENT: THE PHOTO CHECKLIST, THE RECORDED WALKTHROUGH CALL, AND HOW THE
-- SURVEYOR INSPECTED
-- 2 October 2026. src/web/survey-evidence.ts, src/web/survey-checklist.ts.
--
-- Lakhbir, 2 Oct 2026: the photos are kept, for testing ("Keep them, test only"); the walkthrough is a recorded Zoom
-- call ("Recorded Zoom call"); the design as mocked up ("Yes, build it as shown").
--
--   survey_photos               one photo a client took for a checklist item: where its sealed bytes are (never the
--                               bytes), its type, size and SHA-256 (taken after its hidden details — place, camera —
--                               were removed), who and when, and that they said nobody is in it.
--   survey_photo_withdrawals    a photo taken back (by the client, or by staff), with why. It is no longer shown.
--   survey_checklist_marks      an item the client says is not in their building, or not safe or not theirs to
--                               photograph; or that mark taken back. The newest mark is the item's.
--   survey_walkthrough_asks     the client asking for a recorded video call.
--   survey_walkthroughs         a video call booked as this job's walkthrough: its meeting is set to record.
--   survey_recordings           the recording Zoom made of it, as Zoom describes it: its link, passcode and length.
--   survey_recording_views      who opened the recording, and when.
--   survey_inspection_basis     how the surveyor inspected — the newest is theirs — for the report.
-- None is ever edited or deleted.
-- ===========================================================================

CREATE TABLE survey_photos (
  id            TEXT PRIMARY KEY,
  job_id        TEXT NOT NULL REFERENCES surveyor_jobs(id),
  item_key      TEXT NOT NULL CHECK (length(item_key) BETWEEN 2 AND 60 AND item_key NOT GLOB '*[^A-Z0-9-]*'),
  object_key    TEXT NOT NULL UNIQUE CHECK (object_key GLOB 'survey-photos/*'),
  content_type  TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png')),
  byte_size     INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 4500000),
  sha256        TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  note          TEXT CHECK (note IS NULL OR length(trim(note)) BETWEEN 1 AND 500),
  taken_by      TEXT NOT NULL REFERENCES users(id),
  taken_at      TEXT NOT NULL,
  nobody_in_it  INTEGER NOT NULL CHECK (nobody_in_it = 1)
) STRICT;
CREATE INDEX survey_photos_by_job ON survey_photos (job_id, item_key, taken_at);

CREATE TABLE survey_photo_withdrawals (
  photo_id  TEXT PRIMARY KEY REFERENCES survey_photos(id),
  by_user   TEXT NOT NULL REFERENCES users(id),
  reason    TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 300),
  at        TEXT NOT NULL
) STRICT;

CREATE TABLE survey_checklist_marks (
  id        TEXT PRIMARY KEY,
  job_id    TEXT NOT NULL REFERENCES surveyor_jobs(id),
  item_key  TEXT NOT NULL CHECK (length(item_key) BETWEEN 2 AND 60 AND item_key NOT GLOB '*[^A-Z0-9-]*'),
  mark      TEXT NOT NULL CHECK (mark IN ('NOT_HERE', 'NOT_SAFE', 'CLEARED')),
  by_user   TEXT NOT NULL REFERENCES users(id),
  at        TEXT NOT NULL
) STRICT;
CREATE INDEX survey_checklist_marks_by_job ON survey_checklist_marks (job_id, item_key, at);

CREATE TABLE survey_walkthrough_asks (
  id        TEXT PRIMARY KEY,
  job_id    TEXT NOT NULL REFERENCES surveyor_jobs(id),
  by_user   TEXT NOT NULL REFERENCES users(id),
  at        TEXT NOT NULL
) STRICT;

CREATE TABLE survey_walkthroughs (
  id          TEXT PRIMARY KEY,
  job_id      TEXT NOT NULL REFERENCES surveyor_jobs(id),
  booking_id  TEXT NOT NULL UNIQUE REFERENCES bookings(id),
  booked_by   TEXT NOT NULL REFERENCES users(id),
  booked_at   TEXT NOT NULL
) STRICT;

CREATE TABLE survey_recordings (
  id            TEXT PRIMARY KEY,
  walkthrough_id TEXT NOT NULL REFERENCES survey_walkthroughs(id),
  share_url     TEXT NOT NULL CHECK (share_url GLOB 'https://*zoom.us/*'),
  passcode      TEXT CHECK (passcode IS NULL OR length(passcode) BETWEEN 1 AND 64),
  minutes       INTEGER NOT NULL CHECK (minutes BETWEEN 0 AND 600),
  recorded_at   TEXT NOT NULL,
  fetched_by    TEXT NOT NULL REFERENCES users(id),
  fetched_at    TEXT NOT NULL,
  UNIQUE (walkthrough_id, share_url)
) STRICT;

CREATE TABLE survey_recording_views (
  id            TEXT PRIMARY KEY,
  recording_id  TEXT NOT NULL REFERENCES survey_recordings(id),
  by_user       TEXT NOT NULL REFERENCES users(id),
  at            TEXT NOT NULL
) STRICT;

CREATE TABLE survey_inspection_basis (
  id        TEXT PRIMARY KEY,
  job_id    TEXT NOT NULL REFERENCES surveyor_jobs(id),
  basis     TEXT NOT NULL CHECK (basis IN ('DESKTOP_EVIDENCE', 'LIVE_VIDEO', 'SITE_VISIT')),
  note      TEXT CHECK (note IS NULL OR length(trim(note)) BETWEEN 1 AND 500),
  by_user   TEXT NOT NULL REFERENCES users(id),
  at        TEXT NOT NULL
) STRICT;
CREATE INDEX survey_inspection_basis_by_job ON survey_inspection_basis (job_id, at);

CREATE TRIGGER survey_photos_never_edited BEFORE UPDATE ON survey_photos BEGIN SELECT RAISE(ABORT, 'a photo is never edited'); END;
CREATE TRIGGER survey_photos_never_deleted BEFORE DELETE ON survey_photos BEGIN SELECT RAISE(ABORT, 'a photo is never deleted here: withdraw it'); END;
CREATE TRIGGER survey_photo_withdrawals_never_edited BEFORE UPDATE ON survey_photo_withdrawals BEGIN SELECT RAISE(ABORT, 'a withdrawal is never edited'); END;
CREATE TRIGGER survey_photo_withdrawals_never_deleted BEFORE DELETE ON survey_photo_withdrawals BEGIN SELECT RAISE(ABORT, 'a withdrawal is never deleted'); END;
CREATE TRIGGER survey_checklist_marks_never_edited BEFORE UPDATE ON survey_checklist_marks BEGIN SELECT RAISE(ABORT, 'a mark is never edited: make a new one'); END;
CREATE TRIGGER survey_checklist_marks_never_deleted BEFORE DELETE ON survey_checklist_marks BEGIN SELECT RAISE(ABORT, 'a mark is never deleted'); END;
CREATE TRIGGER survey_walkthrough_asks_never_edited BEFORE UPDATE ON survey_walkthrough_asks BEGIN SELECT RAISE(ABORT, 'an ask is never edited'); END;
CREATE TRIGGER survey_walkthrough_asks_never_deleted BEFORE DELETE ON survey_walkthrough_asks BEGIN SELECT RAISE(ABORT, 'an ask is never deleted'); END;
CREATE TRIGGER survey_walkthroughs_never_edited BEFORE UPDATE ON survey_walkthroughs BEGIN SELECT RAISE(ABORT, 'a walkthrough is never edited'); END;
CREATE TRIGGER survey_walkthroughs_never_deleted BEFORE DELETE ON survey_walkthroughs BEGIN SELECT RAISE(ABORT, 'a walkthrough is never deleted'); END;
CREATE TRIGGER survey_recordings_never_edited BEFORE UPDATE ON survey_recordings BEGIN SELECT RAISE(ABORT, 'a recording is never edited'); END;
CREATE TRIGGER survey_recordings_never_deleted BEFORE DELETE ON survey_recordings BEGIN SELECT RAISE(ABORT, 'a recording is never deleted'); END;
CREATE TRIGGER survey_recording_views_never_edited BEFORE UPDATE ON survey_recording_views BEGIN SELECT RAISE(ABORT, 'a view is never edited'); END;
CREATE TRIGGER survey_recording_views_never_deleted BEFORE DELETE ON survey_recording_views BEGIN SELECT RAISE(ABORT, 'a view is never deleted'); END;
CREATE TRIGGER survey_inspection_basis_never_edited BEFORE UPDATE ON survey_inspection_basis BEGIN SELECT RAISE(ABORT, 'a basis is never edited: say a new one'); END;
CREATE TRIGGER survey_inspection_basis_never_deleted BEFORE DELETE ON survey_inspection_basis BEGIN SELECT RAISE(ABORT, 'a basis is never deleted'); END;
