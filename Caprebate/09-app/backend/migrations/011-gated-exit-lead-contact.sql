-- ===========================================================================
-- 011 — A CALL ASKED FOR AT THE REASONED NEGATIVE HAS SOMEWHERE TO LIVE.
--       The gated-exit repair, 11 September 2026
--
-- THE FAULT. A prospect stopped at Q1b — no UK tax bill, or a charity — is
-- offered a call, and the call is the whole point of a reasoned negative. But
-- they reach it with NO PROPERTY AND NO SECTOR, so no organisation can exist:
-- `businesses.sector` is NOT NULL and a healthcare sector, and inventing one
-- would put a fact in the record nobody gave us (N4). `contacts` and
-- `bookings` both required an organisation. So there was nowhere to write the
-- person who asked or the channel they chose, and the close answered 500.
--
-- THE DECISION, recorded as row E22 of 09-app/CAPREBATE-CRM-DISPOSITION.md
-- Part E. Two ways were open:
--
--   (a) let a contact and a booking BELONG TO A LEAD until an organisation
--       exists, and move to the organisation when the lead is linked to one;
--   (b) hold the name and the channel ON THE LEAD.
--
-- (a) IS BUILT, FOR FOUR REASONS, EACH OF WHICH (b) WOULD HAVE BROKEN:
--   1. ONE PLACE A PERSON LIVES. Row E21: "a lead carries no person". A name on
--      the lead is a second identity store, and converting the lead would have
--      to copy it — re-keying, which the CRM ground rules forbid.
--   2. ONE BOOKING VOCABULARY. CB_BOOKING's channels, variant and entry point
--      are written to `bookings` in its own words. `entry_point` has allowed
--      'gated_exit' since migration 003, waiting for exactly this row.
--   3. A TELEPHONE SLOT IS HELD WHERE THE CLASH CHECK LOOKS. `isBookable` reads
--      `bookings`. A slot held anywhere else would be offered to the next
--      prospect too.
--   4. THE CALL IS SEEN WHERE STAFF ALREADY WORK — the calendar's "asked for a
--      call, no time yet" queue reads `bookings`.
--
-- WHAT CHANGES, AND NOTHING ELSE DOES
--   contacts   business_id becomes nullable; lead_id is added; a row carries
--              one or the other or both, never neither.
--   bookings   the same.
--   assessment_drafts   closed_lead_id is added, so a draft closed at a gated
--              exit is finished and replaying its token writes nothing — the
--              job `submitted_assessment_id` does for a draft that produced an
--              assessment, which a gated exit never does.
--   Every other column, CHECK, default, index and trigger is character for
--   character the live schema's, and a test reads them back from sqlite_master.
--
-- ---------------------------------------------------------------------------
-- WHY A REBUILD. SQLite cannot drop NOT NULL from a column in place. The
-- twelve steps are migration 007's, followed to the letter — read that file's
-- header for why each is there, and for the guard that turns
-- `pragma_foreign_key_check` from a report into a failure.
--
-- WHAT HANGS OFF THESE TWO TABLES, RE-DERIVED FROM sqlite_master ON A FRESHLY
-- MIGRATED DATABASE ON 11 SEPTEMBER 2026, NOT REMEMBERED:
--   contacts   contacts_business_idx; contacts_contact_type_insert and _update
--              (migration 009); and one trigger on ANOTHER table that reads it
--              by name — outbox_refuses_do_not_contact (009).
--   bookings   bookings_business_idx (003); bookings_id_business_uq (010), the
--              parent key of leads' composite foreign key; no trigger.
--   Referenced by booking_changes.booking_id (004) and by leads (010), both by
--   name, both surviving the drop and rename with foreign keys off.
--
-- THE OUTBOX TRIGGER IS DROPPED AND RE-CREATED VERBATIM. Its body names
-- `contacts`; between the DROP of the old table and the RENAME of the new one
-- that name does not exist, and SQLite re-parses every trigger on a RENAME.
-- It is the DO_NOT_CONTACT control. A test proves it still refuses afterwards,
-- through a contact's address, because a control silently lost in a rebuild is
-- the worst outcome this migration could have.
-- ===========================================================================

-- 1 · foreign keys off. A no-op inside a transaction, so it goes FIRST.
PRAGMA foreign_keys = OFF;

-- 2 · one transaction. All of it, or none of it.
BEGIN;

DROP TRIGGER outbox_refuses_do_not_contact;

-- ---------------------------------------------------------------- contacts

CREATE TABLE contacts_new (
  id               TEXT PRIMARY KEY,
  -- NULL only while the contact belongs to a lead that has no organisation yet.
  business_id      TEXT REFERENCES businesses(id),
  full_name        TEXT NOT NULL,
  job_role         TEXT,
  job_role_other   TEXT,
  -- Per channel, never once globally: the client picked a route and the
  -- consent is for that route. CB_BOOKING.CONSENTS.
  contact_consent  INTEGER NOT NULL CHECK (contact_consent IN (0,1)),
  -- PECR. Separate, unticked, never a condition of submitting.
  marketing_optin  INTEGER NOT NULL CHECK (marketing_optin IN (0,1)),
  created_at       TEXT NOT NULL,
  contact_type TEXT, is_decision_maker INTEGER CHECK (is_decision_maker IN (0,1)), email TEXT, phone TEXT,
  last_contact_at TEXT, next_follow_up_at TEXT, notes TEXT, updated_at TEXT,
  -- The lead this person asked through, where there is no organisation to hold
  -- them. Kept after the lead is linked: it is where the contact came from.
  lead_id          TEXT REFERENCES leads(id),
  CHECK (business_id IS NOT NULL OR lead_id IS NOT NULL)
) STRICT;

INSERT INTO contacts_new (id, business_id, full_name, job_role, job_role_other, contact_consent, marketing_optin,
  created_at, contact_type, is_decision_maker, email, phone, last_contact_at, next_follow_up_at, notes, updated_at, lead_id)
SELECT id, business_id, full_name, job_role, job_role_other, contact_consent, marketing_optin,
  created_at, contact_type, is_decision_maker, email, phone, last_contact_at, next_follow_up_at, notes, updated_at, NULL
FROM contacts;

DROP TABLE contacts;
ALTER TABLE contacts_new RENAME TO contacts;

CREATE INDEX contacts_business_idx ON contacts(business_id);
CREATE INDEX contacts_lead_idx ON contacts(lead_id);

CREATE TRIGGER contacts_contact_type_insert BEFORE INSERT ON contacts
WHEN NEW.contact_type IS NOT NULL AND NEW.contact_type NOT IN
  ('DECISION_MAKER','FINANCE','ACCOUNTANT','ADVISER','INTRODUCER','OTHER')
BEGIN SELECT RAISE(ABORT, 'contacts.contact_type is not on the contact-type list'); END;

CREATE TRIGGER contacts_contact_type_update BEFORE UPDATE OF contact_type ON contacts
WHEN NEW.contact_type IS NOT NULL AND NEW.contact_type NOT IN
  ('DECISION_MAKER','FINANCE','ACCOUNTANT','ADVISER','INTRODUCER','OTHER')
BEGIN SELECT RAISE(ABORT, 'contacts.contact_type is not on the contact-type list'); END;

-- A LEAD'S CONTACT BELONGS TO THE LEAD'S OWN ORGANISATION, once it has one.
CREATE TRIGGER contacts_lead_same_organisation_insert BEFORE INSERT ON contacts
WHEN NEW.lead_id IS NOT NULL AND NEW.business_id IS NOT NULL
 AND EXISTS (SELECT 1 FROM leads l WHERE l.id = NEW.lead_id AND l.business_id IS NOT NULL AND l.business_id <> NEW.business_id)
BEGIN SELECT RAISE(ABORT, 'a lead''s contact belongs to the lead''s own organisation'); END;

CREATE TRIGGER contacts_lead_same_organisation_update BEFORE UPDATE OF business_id, lead_id ON contacts
WHEN NEW.lead_id IS NOT NULL AND NEW.business_id IS NOT NULL
 AND EXISTS (SELECT 1 FROM leads l WHERE l.id = NEW.lead_id AND l.business_id IS NOT NULL AND l.business_id <> NEW.business_id)
BEGIN SELECT RAISE(ABORT, 'a lead''s contact belongs to the lead''s own organisation'); END;

-- ---------------------------------------------------------------- bookings

CREATE TABLE bookings_new (
  id           TEXT PRIMARY KEY,
  -- NULL only while the booking belongs to a lead that has no organisation yet.
  business_id  TEXT REFERENCES businesses(id),
  assigned_to  TEXT REFERENCES users(id),
  -- CB_BOOKING.CHANNELS, by id, in its order.
  channel      TEXT NOT NULL CHECK (channel IN ('phone','sms_whatsapp','email')),
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
  lead_id      TEXT REFERENCES leads(id),
  -- Only the telephone books a moment; everything else captures and finishes.
  CHECK (channel = 'phone' OR (starts_at IS NULL AND ends_at IS NULL)),
  CHECK (starts_at IS NULL OR (ends_at IS NOT NULL AND ends_at > starts_at)),
  CHECK (sms_variant IS NULL OR channel = 'sms_whatsapp'),
  CHECK (business_id IS NOT NULL OR lead_id IS NOT NULL)
) STRICT;

INSERT INTO bookings_new (id, business_id, assigned_to, channel, sms_variant, entry_point, starts_at, ends_at, created_at, lead_id)
SELECT id, business_id, assigned_to, channel, sms_variant, entry_point, starts_at, ends_at, created_at, NULL
FROM bookings;

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

-- ---------------------------------------------------------------- the outbox control, verbatim from 009

CREATE TRIGGER outbox_refuses_do_not_contact BEFORE INSERT ON outbox
WHEN
  (NEW.business_id IS NOT NULL AND EXISTS (
     SELECT 1 FROM businesses b WHERE b.id = NEW.business_id AND b.client_status = 'DO_NOT_CONTACT'))
  OR EXISTS (
     SELECT 1 FROM businesses b
      WHERE b.client_status = 'DO_NOT_CONTACT' AND lower(b.contact_email) = lower(NEW.to_email))
  OR EXISTS (
     SELECT 1 FROM contacts c JOIN businesses b ON b.id = c.business_id
      WHERE b.client_status = 'DO_NOT_CONTACT' AND lower(c.email) = lower(NEW.to_email))
  OR EXISTS (
     SELECT 1 FROM users u JOIN businesses b ON b.id = u.business_id
      WHERE b.client_status = 'DO_NOT_CONTACT' AND u.email_canonical = lower(NEW.to_email))
BEGIN SELECT RAISE(ABORT, 'E_DO_NOT_CONTACT: nothing may be queued to an organisation marked do not contact'); END;

-- ---------------------------------------------------------------- the draft

ALTER TABLE assessment_drafts ADD COLUMN closed_lead_id TEXT REFERENCES leads(id);

-- 8 · THE GUARD. Zero violations, or this migration does not happen at all.
CREATE TABLE _fk_check_guard (ok INTEGER NOT NULL CHECK (ok = 0)) STRICT;
INSERT INTO _fk_check_guard (ok) SELECT count(*) FROM pragma_foreign_key_check;
DROP TABLE _fk_check_guard;

-- 9 · commit.
COMMIT;

-- 10 · and back on.
PRAGMA foreign_keys = ON;
