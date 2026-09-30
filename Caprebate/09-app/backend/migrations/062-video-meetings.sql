-- ===========================================================================
-- 062 — A ZOOM MEETING FOR EACH VIDEO CALL
-- 30 September 2026. src/connectors/zoom.ts, src/web/video-calls.ts.
--
-- Lakhbir: "with the video call link this should be sent automatically, and i feel zoom would be best for this as we
-- can run it via our platform, is there a way to have zoom embeded on our back end so its done though there?"
--
-- One row per video call that has a meeting. The call is the booking (061 lets `bookings.channel` be 'video'); this
-- holds what Zoom made for it: the meeting's number, Zoom's own join link and passcode (both needed to join, and both
-- in the email the client is sent), and `client_token`, the unguessable part of OUR join page's address
-- (/call/<token>), where the client joins inside our site. Staff join from the back office as the host.
--
-- A cancelled call's meeting (or one whose time is given back) is deleted at Zoom and the row keeps `cancelled_at`, for
-- the record. A moved call keeps its meeting (and so its link): only the time changes, at Zoom and on the booking.
-- ===========================================================================

CREATE TABLE video_meetings (
  id            TEXT PRIMARY KEY,
  booking_id    TEXT NOT NULL REFERENCES bookings(id),
  provider      TEXT NOT NULL CHECK (provider IN ('zoom')),
  meeting_id    TEXT NOT NULL CHECK (meeting_id GLOB '[0-9]*' AND length(meeting_id) BETWEEN 9 AND 12),
  join_url      TEXT NOT NULL CHECK (join_url LIKE 'https://%'),
  passcode      TEXT,
  client_token  TEXT NOT NULL UNIQUE CHECK (length(client_token) = 64),
  created_at    TEXT NOT NULL,
  cancelled_at  TEXT
) STRICT;

-- One live meeting a call. A call whose time is given back loses its meeting; given a time again, it gets a new one.
CREATE UNIQUE INDEX video_meetings_one_live ON video_meetings(booking_id) WHERE cancelled_at IS NULL;

CREATE TRIGGER video_meetings_cancel_is_final BEFORE UPDATE ON video_meetings
WHEN OLD.cancelled_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'a cancelled video meeting is final'); END;
