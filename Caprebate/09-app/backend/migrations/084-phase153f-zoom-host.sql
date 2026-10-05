-- ===========================================================================
-- 084 — EACH VIDEO CALL HOSTED BY ITS OWN MEMBER OF STAFF   Phase 153f, 4 October 2026
--
-- The first live calls (30 Sep 2026) showed that one Zoom user hosts one meeting at a time: with every meeting made
-- under the one shared host (ZOOM_HOST_EMAIL), two calls at the same time could not both run. A meeting is now made
-- under the member of staff the call is assigned to (src/web/video-calls.ts, src/connectors/zoom.ts), and the host's
-- start token is asked for that same person. `host_user_id` records whose Zoom user the meeting was made under.
-- NULL means the shared host: every meeting made before this migration, and any call with nobody assigned, or whose
-- member of staff has no Zoom user on our account (the call's page says so).
-- ===========================================================================

ALTER TABLE video_meetings ADD COLUMN host_user_id TEXT REFERENCES users(id);
