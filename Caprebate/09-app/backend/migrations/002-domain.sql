-- ===========================================================================
-- 002 — the domain the later phases fill in.            Phase 103, 8 Sep 2026
--
-- SCOPE NOTE, so nobody reads this as work Phase 103 did not do. Phase 103
-- builds authentication, roles, authorisation and the audit log. The tables
-- below exist because can(actor, action, object) needs REAL OBJECTS to
-- authorise against — an authorisation layer tested only against invented
-- shapes proves nothing about the application. The SCREENS that fill these are
-- Phases 105 (assessments, calendar, settings), 106 (engaged clients, the
-- business page) and 107 (the surveyor workspace and the accounting view).
-- ===========================================================================

CREATE TABLE businesses (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  sector        TEXT NOT NULL CHECK (sector IN
                  ('care_homes','dental','supported_living','gp','private_hospital')),
  -- The pipeline stage the engaged-client list sorts on (Phase 106).
  stage         TEXT NOT NULL,
  -- NO PERSONAL NAMES. A business has a contact CHANNEL, not a named person:
  -- see the seed and the note in src/seed.ts. Nothing here is a field a
  -- register would have supplied.
  contact_email TEXT,
  contact_phone TEXT,
  preferred_contact TEXT CHECK (preferred_contact IN ('email','telephone','virtual','post')),
  created_at    TEXT NOT NULL
) STRICT;

CREATE TABLE properties (
  id          TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  label       TEXT NOT NULL,
  postcode    TEXT,
  created_at  TEXT NOT NULL
) STRICT;

CREATE INDEX properties_business_idx ON properties(business_id);

CREATE TABLE assessments (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL REFERENCES businesses(id),
  sector        TEXT NOT NULL,
  submitted_at  TEXT NOT NULL,
  -- The range the CLIENT WAS SHOWN, in integer pence. Phase 105 requires the
  -- staff view and the client view of this number never to differ, so there is
  -- ONE column and both views read it.
  shown_low_pence  INTEGER,
  shown_high_pence INTEGER,
  created_at    TEXT NOT NULL
) STRICT;

CREATE INDEX assessments_business_idx ON assessments(business_id);

-- Every question asked, in the order asked. A SKIPPED question is a row, and
-- "I don't know" is a row: both are facts about the claim, not blanks, and
-- Phases 105 and 106 both require them to display as answers in their own
-- right. That is non-negotiable N4 reaching the database — an absent fact must
-- not be storable as a zero or a silence.
CREATE TABLE assessment_answers (
  id            TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments(id),
  ord           INTEGER NOT NULL,
  question_id   TEXT NOT NULL,
  question_text TEXT NOT NULL,
  -- ANSWERED: value is the answer. DONT_KNOW / SKIPPED: value must be NULL and
  -- the state carries the meaning. The CHECK stops the two collapsing.
  state         TEXT NOT NULL CHECK (state IN ('ANSWERED','DONT_KNOW','SKIPPED')),
  value         TEXT,
  CHECK (state <> 'ANSWERED' OR value IS NOT NULL),
  CHECK (state =  'ANSWERED' OR value IS NULL),
  UNIQUE (assessment_id, ord)
) STRICT;

-- The client-facing estimate. QUARANTINED FROM THE SURVEYING ROLE (N1) until
-- the surveyor commits their own figures. This table is never read into a
-- surveyor payload: src/payload.ts is the only assembler and it goes through
-- caprebate-anchor-quarantine.ts rather than re-deciding the rule here.
CREATE TABLE estimates (
  id             TEXT PRIMARY KEY,
  assessment_id  TEXT NOT NULL UNIQUE REFERENCES assessments(id),
  business_id    TEXT NOT NULL REFERENCES businesses(id),
  qualifying_expenditure_pence INTEGER NOT NULL,
  qualifying_pct               REAL    NOT NULL,
  pool_split_main_pence        INTEGER NOT NULL,
  pool_split_special_pence     INTEGER NOT NULL,
  bare_land_pence              INTEGER NOT NULL,
  multiplier                   REAL    NOT NULL,
  indicative_lifetime_saving_pence INTEGER NOT NULL,
  sealed_at      TEXT NOT NULL,
  estimate_hash  TEXT NOT NULL
) STRICT;

-- The surveyor's own workspace. `state` mirrors caprebate-anchor-quarantine.ts;
-- the module remains the authority and this column is its persistence.
CREATE TABLE surveyor_jobs (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL REFERENCES businesses(id),
  assessment_id TEXT NOT NULL REFERENCES assessments(id),
  surveyor_id   TEXT REFERENCES users(id),
  state         TEXT NOT NULL CHECK (state IN ('SEALED','COMMITTED_AND_RELEASED')),
  committed_at  TEXT,
  created_at    TEXT NOT NULL
) STRICT;

CREATE INDEX surveyor_jobs_surveyor_idx ON surveyor_jobs(surveyor_id);

-- CAPREBATE'S OWN FINANCE, and the whole of what the ACCOUNTING role may see
-- about a client. Settled 6 September 2026. There is no join from here to the
-- questions, the register data, the internal notes or the surveyor's workings —
-- the restriction is in the SHAPE of the data, not only in can().
CREATE TABLE invoices (
  id             TEXT PRIMARY KEY,
  business_id    TEXT NOT NULL REFERENCES businesses(id),
  claim_value_pence INTEGER,
  fee_pence      INTEGER,
  invoice_status TEXT NOT NULL CHECK (invoice_status IN ('NOT_RAISED','RAISED','SENT','CREDITED')),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('UNPAID','PART_PAID','PAID','WRITTEN_OFF')),
  -- Caprebate is NOT VAT registered (confirmed Phase 74). Recorded rather than
  -- assumed, because an invoice view that silently adds VAT would be wrong.
  vat_position   TEXT NOT NULL,
  created_at     TEXT NOT NULL
) STRICT;

CREATE INDEX invoices_business_idx ON invoices(business_id);

-- Internal notes. Explicitly NOT visible to ACCOUNTING, and not to CLIENT.
CREATE TABLE internal_notes (
  id          TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  author_id   TEXT NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL
) STRICT;

-- Register data. Never visible to ACCOUNTING. Written only through
-- src/stubs/registers.ts, which runs caprebate-name-exclusion.ts over every
-- record before it is stored (N2) — at the INGESTION boundary, which is where
-- that module says the check belongs.
CREATE TABLE register_records (
  id          TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  source_id   TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  fields_json TEXT NOT NULL,
  obtained_at TEXT NOT NULL,
  UNIQUE (business_id, source_id, entity_id)
) STRICT;

-- What has fired and what has not (Phase 106). Both gates are recorded as
-- states, so a screen can show them honestly instead of bypassing them.
CREATE TABLE research_sources (
  id          TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  source_id   TEXT NOT NULL,
  tier        TEXT NOT NULL CHECK (tier IN ('FREE','PAID')),
  state       TEXT NOT NULL CHECK (state IN
                ('NOT_RUN','FIRED','FAILED','NOT_PERMITTED_YET')),
  fired_at    TEXT,
  detail      TEXT,
  UNIQUE (business_id, source_id)
) STRICT;

CREATE TABLE engagements (
  id           TEXT PRIMARY KEY,
  business_id  TEXT NOT NULL UNIQUE REFERENCES businesses(id),
  letter_state TEXT NOT NULL CHECK (letter_state IN ('NOT_SENT','SENT','VIEWED','SIGNED')),
  signed_at    TEXT,
  created_at   TEXT NOT NULL
) STRICT;

-- Per-user working times feed the booking system (Phase 105). ONE source, not
-- two: a slot outside these hours must not be offerable.
CREATE TABLE working_times (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  weekday     INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_min   INTEGER NOT NULL CHECK (start_min BETWEEN 0 AND 1440),
  end_min     INTEGER NOT NULL CHECK (end_min   BETWEEN 0 AND 1440),
  CHECK (end_min > start_min),
  UNIQUE (user_id, weekday, start_min)
) STRICT;

CREATE TABLE bookings (
  id           TEXT PRIMARY KEY,
  business_id  TEXT NOT NULL REFERENCES businesses(id),
  assigned_to  TEXT REFERENCES users(id),
  channel      TEXT NOT NULL CHECK (channel IN ('telephone','virtual')),
  starts_at    TEXT NOT NULL,
  ends_at      TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  CHECK (ends_at > starts_at)
) STRICT;

CREATE INDEX bookings_business_idx ON bookings(business_id);
