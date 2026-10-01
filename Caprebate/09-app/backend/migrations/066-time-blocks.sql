-- ===========================================================================
-- 066 — TIME A PERSON HAS BLOCKED OFF IN THEIR OWN DIARY
-- 1 October 2026. src/web/time-blocks.ts, src/web/schedule.ts, src/web/staff-dashboard.ts.
--
-- Lakhbir: "a calendar allowing users to block off time look what what they have booked in the future". A block is a
-- span of one person's diary — a holiday, an appointment, time to work — in which nobody can book them a call: the slot
-- finder and the booking check read blocks exactly as they read calls (`bookedSpans`, `isBookable`). The reason is the
-- person's own words, seen by staff only. A block is never edited or deleted: taking it off records when, and by whom.
-- ===========================================================================

CREATE TABLE time_blocks (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  starts_at   TEXT NOT NULL,
  ends_at     TEXT NOT NULL,
  reason      TEXT NOT NULL DEFAULT '' CHECK (length(reason) <= 120),
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL,
  removed_at  TEXT,
  removed_by  TEXT REFERENCES users(id),
  CHECK (ends_at > starts_at),
  CHECK ((removed_at IS NULL) = (removed_by IS NULL))
) STRICT;

CREATE INDEX time_blocks_user_idx ON time_blocks(user_id, starts_at);

CREATE TRIGGER time_blocks_never_edited BEFORE UPDATE OF id, user_id, starts_at, ends_at, reason, created_by, created_at ON time_blocks
BEGIN SELECT RAISE(ABORT, 'a block of time is never edited: take it off and add another'); END;

CREATE TRIGGER time_blocks_removed_once BEFORE UPDATE OF removed_at, removed_by ON time_blocks
WHEN OLD.removed_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'a block of time is taken off once'); END;

CREATE TRIGGER time_blocks_never_deleted BEFORE DELETE ON time_blocks
BEGIN SELECT RAISE(ABORT, 'a block of time is never deleted'); END;
