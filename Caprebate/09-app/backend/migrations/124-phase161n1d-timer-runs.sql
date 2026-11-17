-- ===========================================================================
-- 124 — EVERY TIMER RUN, WRITTEN DOWN                                  Phase 161n1d, 17 November 2026
--
-- ITRoadway's second code review (12 Nov 2026), M-10: a failed timer run answered 500 and wrote one log line, and
-- nobody was told. Now each run of the live website's timers (src/app/timers.ts: every-five-minutes, nightly, backup)
-- is kept here, and a run that is not ok emails the addresses in CAPREBATE_ALERT_EMAILS. Admin's Connections page
-- shows each job's last run and its last good run; the five-minute job checks that a good backup ran in the last
-- 26 hours.
--
--   job    which timer ('every-five-minutes', 'nightly' or 'backup')
--   at     when the run ended
--   ok     1 when every step finished, 0 when one did not (or the audit chain was found broken)
--   line   the run's own line: counts only, never an address, a name or a word of an email
--
-- A new table and nothing else: no table is rebuilt, so it runs on Turso as it does here.
-- ===========================================================================

CREATE TABLE timer_runs (
  id    INTEGER PRIMARY KEY,
  job   TEXT NOT NULL CHECK (job IN ('every-five-minutes', 'nightly', 'backup')),
  at    TEXT NOT NULL,
  ok    INTEGER NOT NULL CHECK (ok IN (0, 1)),
  line  TEXT NOT NULL
) STRICT;

CREATE INDEX timer_runs_by_job ON timer_runs (job, at);
