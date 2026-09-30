-- ===========================================================================
-- 061 — A VIDEO CALL AS A WAY TO BE REACHED, AND SEVERAL COMPANIES AS ONE ENQUIRY
-- 30 September 2026. The four-stage funnel (src/web/funnel4.ts).
--
-- 1 · VIDEO. Lakhbir, 30 September 2026: the figure's page offers three ways to be reached — "Telephone - they
--     choose a time and date (they type in their number); Video call - they choose time and date and (type their
--     email); email". Video was taken out on 3 September (CB_BOOKING, "THREE CHANNELS, AND VIDEO IS GONE") because it
--     was quietly standing in for a SURVEY walkthrough; that question is still the surveyor's and is not answered
--     here. This is a SALES call by video, chosen by Lakhbir, on the record: `bookings.channel` gains 'video', and a
--     video call, like a telephone call, may hold a moment. Nothing sends a meeting link yet: the team sends it.
--     SQLite cannot change a CHECK in place, so `bookings` is rebuilt, as 014 rebuilt `contacts`: every column, the
--     four triggers on the table and its three indexes, in the same words. `leads.booking_id` and
--     `booking_changes.booking_id` refer to it by name and survive the drop and rename with foreign keys off.
--
-- 2 · ONE ENQUIRY. Lakhbir: "different buildings maybe held but different companies but same directors". One
--     assessment may now make several organisations, each with its own lead, engagement and claims, because each
--     company signs and claims in its own name. `leads.enquiry_id` ties the leads one assessment made, so Sales sees
--     them together. Not a foreign key: it names a group, not a row.
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
  -- CB_BOOKING.ENTRY_POINTS. 'gated_exit' is the one everybody forgets and is
  -- the highest-value place to offer a call.
  entry_point  TEXT NOT NULL CHECK (entry_point IN ('funnel_close','after_refined_range','gated_exit')),
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

-- 3 · one enquiry, several organisations.
ALTER TABLE leads ADD COLUMN enquiry_id TEXT;
CREATE INDEX leads_enquiry_idx ON leads(enquiry_id);

-- 4 · THE GUARD. Zero violations, or this migration does not happen at all.
CREATE TABLE _fk_check_guard (ok INTEGER NOT NULL CHECK (ok = 0)) STRICT;
INSERT INTO _fk_check_guard (ok) SELECT count(*) FROM pragma_foreign_key_check;
DROP TABLE _fk_check_guard;

-- 5 · commit.
COMMIT;

-- 6 · and back on.
PRAGMA foreign_keys = ON;
