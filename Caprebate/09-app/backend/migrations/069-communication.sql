-- ===========================================================================
-- 069 — CHAT BECOMES COMMUNICATION: A CALL STAFF BOOK, A CALL STAFF LOG, A VIDEO CALL STARTED
-- 1 October 2026. src/web/communication.ts.
--
-- Lakhbir approved a mock-up: one place on each client to write to them (email, WhatsApp, portal, team only), log a
-- telephone call, and start or book a Zoom call — beside the whole conversation.
--
-- 1 · A CALL STAFF BOOK. `bookings.entry_point` named only where a client asked for a call (the funnel's three
--     places). A Zoom call started or booked from the Communication tab is 'staff'. SQLite cannot change a CHECK in
--     place, so `bookings` is rebuilt as 061 rebuilt it: every column, its three indexes and five triggers, in the same
--     words, with foreign keys off (`video_meetings`, `booking_changes` and `leads` refer to it by name).
-- 2 · A CALL STAFF LOG. `call_logs`: who was rung, how it went, the notes, and the follow-up task if one was made.
--     Never edited or deleted.
-- 3 · A VIDEO CALL STARTED. `video_meetings.host_opened_at` and `host_opened_by`: when a member of staff first opened
--     the call as its host — so the conversation can say the call was started, and by whom. How long it ran and who
--     joined are Zoom's to tell (a further permission on the Zoom app); not here.
-- ===========================================================================

-- 1 · foreign keys off. A no-op inside a transaction, so it goes FIRST.
PRAGMA foreign_keys = OFF;

-- 2 · one transaction. All of it, or none of it.
BEGIN;

CREATE TABLE bookings_new (
  id           TEXT PRIMARY KEY,
  -- NULL only while the booking belongs to a lead that has no organisation yet.
  business_id  TEXT REFERENCES businesses(id),
  assigned_to  TEXT REFERENCES users(id),
  -- CB_BOOKING.CHANNELS, by id, and since 061 'video' (a sales call by video, Lakhbir, 30 Sep 2026).
  channel      TEXT NOT NULL CHECK (channel IN ('phone','sms_whatsapp','email','video')),
  -- ONE choice to the client, TWO processors to us. CB_BOOKING records the
  -- variant; WhatsApp is a third-party processor and must be on the published
  -- processor list before the option renders.
  sms_variant  TEXT CHECK (sms_variant IN ('sms','whatsapp')),
  -- CB_BOOKING.ENTRY_POINTS, and since 069 'staff': a call staff started or booked from the Communication tab.
  -- 'gated_exit' is the one everybody forgets and is
  -- the highest-value place to offer a call.
  entry_point  TEXT NOT NULL CHECK (entry_point IN ('funnel_close','after_refined_range','gated_exit','staff')),
  starts_at    TEXT,
  ends_at      TEXT,
  created_at   TEXT NOT NULL,
  lead_id      TEXT REFERENCES leads(id), cancelled_at TEXT, cancelled_by TEXT REFERENCES users(id),
  -- A telephone call or a video call books a moment; everything else captures and finishes.
  CHECK (channel IN ('phone','video') OR (starts_at IS NULL AND ends_at IS NULL)),
  CHECK (starts_at IS NULL OR (ends_at IS NOT NULL AND ends_at > starts_at)),
  CHECK (sms_variant IS NULL OR channel = 'sms_whatsapp'),
  CHECK (business_id IS NOT NULL OR lead_id IS NOT NULL)
) STRICT;

INSERT INTO bookings_new (id, business_id, assigned_to, channel, sms_variant, entry_point, starts_at, ends_at, created_at,
                          lead_id, cancelled_at, cancelled_by)
  SELECT id, business_id, assigned_to, channel, sms_variant, entry_point, starts_at, ends_at, created_at,
         lead_id, cancelled_at, cancelled_by FROM bookings;

DROP TABLE bookings;
ALTER TABLE bookings_new RENAME TO bookings;

CREATE INDEX bookings_business_idx ON bookings(business_id);
CREATE UNIQUE INDEX bookings_id_business_uq ON bookings(id, business_id);
CREATE INDEX bookings_lead_idx ON bookings(lead_id);

CREATE TRIGGER bookings_lead_same_organisation_insert BEFORE INSERT ON bookings
WHEN NEW.lead_id IS NOT NULL AND NEW.business_id IS NOT NULL
 AND EXISTS (SELECT 1 FROM leads l WHERE l.id = NEW.lead_id AND l.business_id IS NOT NULL AND l.business_id <> NEW.business_id)
BEGIN SELECT RAISE(ABORT, 'a lead''s booking belongs to the lead''s own organisation'); END;

CREATE TRIGGER bookings_lead_same_organisation_update BEFORE UPDATE OF business_id, lead_id ON bookings
WHEN NEW.lead_id IS NOT NULL AND NEW.business_id IS NOT NULL
 AND EXISTS (SELECT 1 FROM leads l WHERE l.id = NEW.lead_id AND l.business_id IS NOT NULL AND l.business_id <> NEW.business_id)
BEGIN SELECT RAISE(ABORT, 'a lead''s booking belongs to the lead''s own organisation'); END;

CREATE TRIGGER bookings_cancel_not_on_insert BEFORE INSERT ON bookings
WHEN NEW.cancelled_at IS NOT NULL OR NEW.cancelled_by IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'a booking is written uncancelled; cancelling is an update that names who and when'); END;

CREATE TRIGGER bookings_cancel_names_who_and_when BEFORE UPDATE OF cancelled_at, cancelled_by ON bookings
WHEN (NEW.cancelled_at IS NULL) <> (NEW.cancelled_by IS NULL)
BEGIN SELECT RAISE(ABORT, 'a cancellation records both who cancelled and when'); END;

CREATE TRIGGER bookings_cancel_is_final BEFORE UPDATE ON bookings
WHEN OLD.cancelled_at IS NOT NULL AND (
     NEW.cancelled_at IS NOT OLD.cancelled_at OR NEW.cancelled_by IS NOT OLD.cancelled_by
  OR NEW.starts_at IS NOT OLD.starts_at OR NEW.ends_at IS NOT OLD.ends_at
  OR NEW.assigned_to IS NOT OLD.assigned_to)
BEGIN SELECT RAISE(ABORT, 'a cancelled call is final: it cannot be un-cancelled, moved or reassigned'); END;

-- 3 · the calls staff log.
CREATE TABLE call_logs (
  id           TEXT PRIMARY KEY,
  business_id  TEXT NOT NULL REFERENCES businesses(id),
  claim_id     TEXT REFERENCES claims(id),
  contact_id   TEXT REFERENCES contacts(id),
  outcome      TEXT NOT NULL CHECK (outcome IN ('SPOKE','NO_ANSWER','VOICEMAIL')),
  notes        TEXT NOT NULL CHECK (length(notes) <= 4000),
  logged_by    TEXT NOT NULL REFERENCES users(id),
  logged_at    TEXT NOT NULL,
  task_id      TEXT REFERENCES staff_tasks(id)
) STRICT;

CREATE INDEX call_logs_business_idx ON call_logs(business_id, logged_at);

CREATE TRIGGER call_logs_never_edited BEFORE UPDATE ON call_logs
BEGIN SELECT RAISE(ABORT, 'a logged call is never edited: log another'); END;

CREATE TRIGGER call_logs_never_deleted BEFORE DELETE ON call_logs
BEGIN SELECT RAISE(ABORT, 'a logged call is never deleted'); END;

-- 4 · when a video call was first opened by its host.
ALTER TABLE video_meetings ADD COLUMN host_opened_at TEXT;
ALTER TABLE video_meetings ADD COLUMN host_opened_by TEXT REFERENCES users(id);

-- 5 · THE GUARD. Zero violations, or this migration does not happen at all.
CREATE TABLE _fk_check_guard (ok INTEGER NOT NULL CHECK (ok = 0)) STRICT;
INSERT INTO _fk_check_guard (ok) SELECT count(*) FROM pragma_foreign_key_check;
DROP TABLE _fk_check_guard;

-- 6 · commit.
COMMIT;

-- 7 · and back on.
PRAGMA foreign_keys = ON;
