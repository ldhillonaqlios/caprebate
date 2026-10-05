-- PHASE 156d, 5 October 2026 — HOW LONG A VIDEO CALL LASTED, AND HOW MANY JOINED (src/web/video-calls.ts,
-- checkCallLength; src/connectors/zoom.ts, zoomPastCall). Two numbers from Zoom and when they were asked for. Never a
-- name or an email: Zoom's list of who joined is read for its count only and never kept.
-- call_check_state: FOUND (the two numbers are Zoom's), NOT_YET (Zoom had no record yet), NOT_ON_PLAN (our free Zoom
-- plan does not give it), NOT_FOUND (anything else; the screen says why at the time).
ALTER TABLE video_meetings ADD COLUMN call_minutes INTEGER CHECK (call_minutes IS NULL OR call_minutes BETWEEN 0 AND 1440);
ALTER TABLE video_meetings ADD COLUMN call_people INTEGER CHECK (call_people IS NULL OR call_people BETWEEN 0 AND 1000);
ALTER TABLE video_meetings ADD COLUMN call_checked_at TEXT;
ALTER TABLE video_meetings ADD COLUMN call_check_state TEXT CHECK (call_check_state IS NULL OR call_check_state IN ('FOUND', 'NOT_YET', 'NOT_ON_PLAN', 'NOT_FOUND'));
