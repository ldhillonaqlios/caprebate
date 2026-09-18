-- ===========================================================================
-- 025 — A CLIENT MAY CANCEL THEIR OWN CALL.        Phase 132e, 16 September 2026
--
-- WHY. Lakhbir, answering "How late may a client move their own call, and may
-- they cancel it outright?": "Give the client full control to cancel at any
-- time, and rebook at a time that suits them". Until today the portal refused
-- a cancellation on purpose (src/web/portal.ts, decision 2 of Phase 113a) and
-- refused any change inside two hours of the call. Both refusals are lifted for
-- a call the client ALREADY HOLDS. A NEW time chosen when rebooking must still
-- be at least two hours away (CLIENT_MOVE_NOTICE_MINUTES in src/web/schedule.ts).
--
-- WHAT A CANCELLATION IS. The booking row SURVIVES, with its time, its channel
-- and its entry point: `cancelled_at` and `cancelled_by` are set, and from then
-- on the row no longer holds a slot (src/web/schedule.ts reads
-- `cancelled_at IS NULL`). The back office's calendar shows it as cancelled,
-- naming who and when. The ENQUIRY is untouched — no lead, claim or
-- organisation status moves — so a cancelled call is not a lost client.
--
-- A CANCELLATION IS FINAL ON ITS ROW. Once set, neither column can be cleared or
-- changed, and the call's time and owner cannot be moved: a further call is a
-- new conversation, not an edit that would make the record say the call was
-- never cancelled. The history row in `booking_changes` carries `cancelled = 1`.
-- ===========================================================================

ALTER TABLE bookings ADD COLUMN cancelled_at TEXT;
ALTER TABLE bookings ADD COLUMN cancelled_by TEXT REFERENCES users(id);

ALTER TABLE booking_changes ADD COLUMN cancelled INTEGER NOT NULL DEFAULT 0 CHECK (cancelled IN (0, 1));

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
