-- ===========================================================================
-- 088 — WHEN REPLIES WERE LAST READ   Phase 155 (line 5), 4 October 2026
--
-- An outside timer (cron-job.org, set up by hand by Lakhbir: Phase 156 A3) wakes the website every five minutes to
-- read email replies (POST /hooks/read-replies). Each copy of the website kept what its own last read found in memory
-- only, so if the timer stopped, nothing anywhere said so. One row, shared by every copy: when a read was last tried,
-- when one last worked, and whether the last try failed. Admin's home page warns when no read has worked for more than
-- an hour during working hours (src/web/inbound-email.ts, repliesStale). Times only: never an address, a subject or a
-- word of any email, and never an error's text.
-- ===========================================================================

CREATE TABLE mailbox_reads (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  last_try_at  TEXT NOT NULL,
  last_ok_at   TEXT,
  last_failed  INTEGER NOT NULL CHECK (last_failed IN (0, 1))
) STRICT;
