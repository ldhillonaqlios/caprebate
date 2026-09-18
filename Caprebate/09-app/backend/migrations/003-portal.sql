-- ===========================================================================
-- 003 — the public half and the client portal.          Phase 104, 8 Sep 2026
--
-- Block C of the Developer Build Order: the website, the assessment, the
-- customer login and the client portal behind it.
--
-- TWO THINGS THIS MIGRATION CORRECTS IN 002, and both are the same mistake:
-- a second vocabulary invented next to one that already existed.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. BOOKINGS — rebuilt onto CB_BOOKING's channels.
--
-- 002 declared  channel IN ('telephone','virtual').  CB_BOOKING is the booking
-- model and its channels are 'phone', 'sms_whatsapp' and 'email'. 'virtual' is
-- VIDEO, which CB_BOOKING deliberately REMOVED on 3 September 2026 (Phases
-- 69-71) and whose own comment says: "If the surveyor says yes, video returns
-- as a POST-ENGAGEMENT SURVEY STEP against the surveyor's diary — a different
-- screen, a different calendar, a different owner. Do not quietly re-add it
-- here." A CHECK constraint that only accepts video and telephone would have
-- re-added it by making everything else unstorable.
--
-- The table is empty (the Phase 103 seed writes no bookings), so this is a
-- clean rebuild rather than a data migration.
--
-- ONLY 'phone' BOOKS A SLOT. CB_BOOKING.booksASlot is the authority; the CHECK
-- below is its persistence, so a row that carries a time for a channel that
-- cannot hold one is unstorable rather than merely wrong.
-- ---------------------------------------------------------------------------
DROP TABLE bookings;

CREATE TABLE bookings (
  id           TEXT PRIMARY KEY,
  business_id  TEXT NOT NULL REFERENCES businesses(id),
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
  -- Only the telephone books a moment; everything else captures and finishes.
  CHECK (channel = 'phone' OR (starts_at IS NULL AND ends_at IS NULL)),
  CHECK (starts_at IS NULL OR (ends_at IS NOT NULL AND ends_at > starts_at)),
  CHECK (sms_variant IS NULL OR channel = 'sms_whatsapp')
) STRICT;

CREATE INDEX bookings_business_idx ON bookings(business_id);

-- ---------------------------------------------------------------------------
-- 2. CONTACTS — CB_BOOKING.IDENTITY_FIELDS, captured at the funnel close.
--
-- WHY THIS DOES NOT BREACH N2, because it looks like it might. The name
-- exclusion register governs REGISTER-DERIVED third-party names — people we
-- learn about from a public register or a client's uploaded document, who never
-- asked to deal with us. This row is the client's OWN name, given by them, to
-- get a call they requested. Different population, different lawful basis,
-- different rules. `assertNoUnauthorisedName` runs at the ingestion boundary in
-- src/stubs/registers.ts and is not weakened by this table.
--
-- NOTHING PERSONAL IS ASKED UNTIL THE CLIENT HAS BEEN GIVEN A FIGURE. That is
-- CB_BOOKING's rule and this table is only ever written at the funnel close.
-- ---------------------------------------------------------------------------
CREATE TABLE contacts (
  id               TEXT PRIMARY KEY,
  business_id      TEXT NOT NULL REFERENCES businesses(id),
  full_name        TEXT NOT NULL,
  job_role         TEXT,
  job_role_other   TEXT,
  -- Per channel, never once globally: the client picked a route and the
  -- consent is for that route. CB_BOOKING.CONSENTS.
  contact_consent  INTEGER NOT NULL CHECK (contact_consent IN (0,1)),
  -- PECR. Separate, unticked, never a condition of submitting.
  marketing_optin  INTEGER NOT NULL CHECK (marketing_optin IN (0,1)),
  created_at       TEXT NOT NULL
) STRICT;

CREATE INDEX contacts_business_idx ON contacts(business_id);

-- ---------------------------------------------------------------------------
-- 3. CLIENT TASKS — "questions we still need answered".
--
-- Phase 106 builds the sending half; this is the half the client sees and
-- answers. Three fields the portal must show for every one of them: what is
-- asked, WHY, and WHAT IT HOLDS UP. A task with no stated consequence is a
-- chore; a task that says what it unblocks gets answered.
--
-- answered_by IS THE POINT OF THE `answered_by_role` COLUMN. An answer typed by
-- a staff member on the client's behalf is a different fact from an answer the
-- client gave, and a claim file that cannot tell them apart cannot be defended.
-- ---------------------------------------------------------------------------
CREATE TABLE client_tasks (
  id              TEXT PRIMARY KEY,
  business_id     TEXT NOT NULL REFERENCES businesses(id),
  asked_by        TEXT REFERENCES users(id),
  question        TEXT NOT NULL,
  why            TEXT NOT NULL,
  holds_up        TEXT NOT NULL,
  state           TEXT NOT NULL CHECK (state IN ('OPEN','ANSWERED','WITHDRAWN')),
  -- N4 REACHING THE PORTAL. "I don't know" is an answer, not a blank, and it
  -- must not be storable as an empty string that later reads as unanswered.
  answer_state    TEXT CHECK (answer_state IN ('ANSWERED','DONT_KNOW')),
  answer          TEXT,
  answered_at     TEXT,
  answered_by     TEXT REFERENCES users(id),
  answered_by_role TEXT CHECK (answered_by_role IN ('CLIENT','STAFF')),
  created_at      TEXT NOT NULL,
  CHECK (state <> 'ANSWERED' OR (answer_state IS NOT NULL AND answered_at IS NOT NULL
                                 AND answered_by_role IS NOT NULL)),
  CHECK (answer_state IS NOT 'ANSWERED' OR answer IS NOT NULL),
  CHECK (answer_state IS NOT 'DONT_KNOW' OR answer IS NULL)
) STRICT;

CREATE INDEX client_tasks_business_idx ON client_tasks(business_id);

-- ---------------------------------------------------------------------------
-- 4. DOCUMENTS — one row per client upload, mirroring the upload handler's job.
--
-- THE HANDLER IS THE AUTHORITY, NOT THIS TABLE. `state` is a copy of
-- UploadJob.state for display; the twelve-step RECEIPT_CONTRACT order is
-- enforced in caprebate-upload-handler.ts and is not re-decided here.
--
-- storage_key IS THE QUARANTINE OR DURABLE KEY, NEVER A URL. A pre-signed URL
-- is a bearer capability and is never persisted or logged — the handler's own
-- comment says so at PresignedUpload.
-- ---------------------------------------------------------------------------
CREATE TABLE documents (
  id             TEXT PRIMARY KEY,      -- the handler's doc_id
  business_id    TEXT NOT NULL REFERENCES businesses(id),
  uploaded_by    TEXT NOT NULL REFERENCES users(id),
  filename       TEXT NOT NULL,
  declared_type  TEXT,
  doc_type       TEXT,
  byte_size      INTEGER,
  sniffed_as     TEXT,
  state          TEXT NOT NULL,
  -- The two controls a data protection officer asks about, recorded as facts
  -- rather than inferred from the absence of an error.
  strip_recorded_at   TEXT,
  quarantine_discharged_at TEXT,
  failure_code   TEXT,
  created_at     TEXT NOT NULL
) STRICT;

CREATE INDEX documents_business_idx ON documents(business_id);

-- ---------------------------------------------------------------------------
-- 5. THE UPLOAD HANDLER'S AUDIT SINK.
--
-- The handler takes an AuditSink PORT and writes one event per contract step.
-- This is the adapter. It is SEPARATE from the identity audit log in 001: that
-- one is hash-chained and covers authentication and document ACCESS; this one
-- is the document PIPELINE's own trace, keyed to the RECEIPT_CONTRACT step
-- number, and it is what makes "show the strip and the quarantine happening"
-- something a screen can render instead of something a comment claims.
--
-- NEVER THE DOCUMENT'S CONTENT, NEVER A NAME, NEVER THE PRE-SIGNED URL.
-- ---------------------------------------------------------------------------
CREATE TABLE document_events (
  id            TEXT PRIMARY KEY,
  job_id        TEXT NOT NULL,
  doc_id        TEXT NOT NULL,
  contract_step INTEGER NOT NULL,
  action        TEXT NOT NULL,
  outcome       TEXT NOT NULL CHECK (outcome IN ('ok','refused','failed')),
  detail_json   TEXT NOT NULL,
  at            TEXT NOT NULL
) STRICT;

CREATE INDEX document_events_doc_idx ON document_events(doc_id, contract_step);

-- ---------------------------------------------------------------------------
-- 6. ASSESSMENT DRAFTS — the funnel's state, held SERVER-SIDE.
--
-- The browser gets an opaque token in an httpOnly cookie and nothing else. The
-- answers themselves never travel in a hidden field, a query string or local
-- storage, because "validate every input server-side" is unachievable if the
-- server's idea of the session is whatever the client last posted back.
--
-- IT IS ALSO THE ONLY WAY THE SIX SCREENS CAN WORK WITHOUT JAVASCRIPT. The
-- site's own renderer keeps the state in a variable and re-draws with inline
-- onclick handlers; the CSP here forbids inline script, so the state has to
-- live somewhere the server owns. Same screens, same copy, same order.
--
-- NOTHING PERSONAL IS IN state_json UNTIL THE FUNNEL CLOSE, which is
-- CB_BOOKING's rule and not a storage decision.
-- ---------------------------------------------------------------------------
CREATE TABLE assessment_drafts (
  token       TEXT PRIMARY KEY,
  state_json  TEXT NOT NULL,
  screen      TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  -- Set once the draft has been turned into a real assessment, so a replayed
  -- token cannot submit the same funnel twice.
  submitted_assessment_id TEXT REFERENCES assessments(id)
) STRICT;
