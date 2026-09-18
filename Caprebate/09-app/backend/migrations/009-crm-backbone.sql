-- ===========================================================================
-- 009 — THE CRM BACKBONE: organisations, contacts, properties and the claim
-- record.                                         CRM 1 of 10, 10 Sep 2026
--
-- The scope of this file, and of the nine CRM phases after it, is
-- 09-app/CAPREBATE-CRM-DISPOSITION.md. Read its Part E before changing anything
-- here: every non-obvious choice below is recorded there with its reason.
--
-- EXTENDED, NEVER REBUILT. `businesses`, `contacts` and `properties` gain
-- columns by ALTER TABLE ADD COLUMN; nothing is dropped, renamed or copied.
-- Thirteen tables carry a foreign key into `businesses`, and migration 007
-- records what rebuilding it costs.
--
-- ---------------------------------------------------------------------------
-- WHY THE NEW VOCABULARIES ARE TRIGGERS AND NOT CHECK CONSTRAINTS
--
-- SQLite cannot change a CHECK without rebuilding the table (007 again). A
-- vocabulary a later phase is expected to change — the claim's stage, which
-- CRM 2 of 10 replaces with the operating procedure's ten — is therefore
-- enforced by a NAMED TRIGGER PAIR, so that phase drops two triggers and
-- creates two, and rebuilds nothing. A domain that is fixed by its nature
-- (yes/no/unknown, a tenure, a nation) is a CHECK on the added column.
--
-- ---------------------------------------------------------------------------
-- N4 REACHES EVERY NEW COLUMN. Nothing here has a default that asserts a fact.
-- A column nobody has recorded is NULL, and where the vocabulary also carries
-- UNKNOWN the two are rendered identically and neither passes anything. The
-- one default — `client_status` PROSPECT — is not a guess: a business in this
-- table arrived through the funnel, and a business that arrived through the
-- funnel and has signed nothing is a prospect by definition.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1 · ORGANISATIONS — `businesses`, extended.
--
-- STILL NO PERSONAL NAMES. Nothing added here names a person: a legal name and
-- a trading name are the organisation's, and an address is a place.
--
-- THE EXISTING `name` BECOMES THE TRADING NAME. It is what the client typed at
-- the funnel close — what the business calls itself — and it was never checked
-- against a register. `trading_name` is a VIRTUAL generated column reading it,
-- so there is one stored value and the two cannot drift. `legal_name` is
-- recorded, or derived at read time from a Companies House register record.
-- ---------------------------------------------------------------------------
ALTER TABLE businesses ADD COLUMN legal_name TEXT;
ALTER TABLE businesses ADD COLUMN trading_name TEXT GENERATED ALWAYS AS (name) VIRTUAL;
-- Nullable: a partnership, a sole trader and an individual have none.
ALTER TABLE businesses ADD COLUMN company_number TEXT;
-- From the Tax Implication Summary variants and the AML/KYC Position Paper §5.
ALTER TABLE businesses ADD COLUMN claimant_type TEXT;
ALTER TABLE businesses ADD COLUMN registered_address TEXT;
ALTER TABLE businesses ADD COLUMN trading_address TEXT;
ALTER TABLE businesses ADD COLUMN website TEXT;
-- DO_NOT_CONTACT IS A CONTROL, NOT A LABEL — see section 5, the outbox.
ALTER TABLE businesses ADD COLUMN client_status TEXT NOT NULL DEFAULT 'PROSPECT';
-- The lead-source list CRM 2 of 10 adopts.
ALTER TABLE businesses ADD COLUMN source TEXT;
ALTER TABLE businesses ADD COLUMN owner_id TEXT REFERENCES users(id);
ALTER TABLE businesses ADD COLUMN updated_at TEXT;

CREATE TRIGGER businesses_claimant_type_insert BEFORE INSERT ON businesses
WHEN NEW.claimant_type IS NOT NULL AND NEW.claimant_type NOT IN
  ('COMPANY','LLP','PARTNERSHIP','SOLE_TRADER','INDIVIDUAL','CHARITY','UNKNOWN')
BEGIN SELECT RAISE(ABORT, 'businesses.claimant_type is not on the claimant-type list'); END;

CREATE TRIGGER businesses_claimant_type_update BEFORE UPDATE OF claimant_type ON businesses
WHEN NEW.claimant_type IS NOT NULL AND NEW.claimant_type NOT IN
  ('COMPANY','LLP','PARTNERSHIP','SOLE_TRADER','INDIVIDUAL','CHARITY','UNKNOWN')
BEGIN SELECT RAISE(ABORT, 'businesses.claimant_type is not on the claimant-type list'); END;

CREATE TRIGGER businesses_client_status_insert BEFORE INSERT ON businesses
WHEN NEW.client_status NOT IN ('PROSPECT','ACTIVE','DORMANT','FORMER','DO_NOT_CONTACT')
BEGIN SELECT RAISE(ABORT, 'businesses.client_status is not on the client-status list'); END;

CREATE TRIGGER businesses_client_status_update BEFORE UPDATE OF client_status ON businesses
WHEN NEW.client_status NOT IN ('PROSPECT','ACTIVE','DORMANT','FORMER','DO_NOT_CONTACT')
BEGIN SELECT RAISE(ABORT, 'businesses.client_status is not on the client-status list'); END;

CREATE TRIGGER businesses_source_insert BEFORE INSERT ON businesses
WHEN NEW.source IS NOT NULL AND NEW.source NOT IN
  ('WEBSITE','REFERRAL','ACCOUNTANT','ADVISER','OUTBOUND','EVENT','EXISTING_CLIENT','OTHER')
BEGIN SELECT RAISE(ABORT, 'businesses.source is not on the lead-source list'); END;

CREATE TRIGGER businesses_source_update BEFORE UPDATE OF source ON businesses
WHEN NEW.source IS NOT NULL AND NEW.source NOT IN
  ('WEBSITE','REFERRAL','ACCOUNTANT','ADVISER','OUTBOUND','EVENT','EXISTING_CLIENT','OTHER')
BEGIN SELECT RAISE(ABORT, 'businesses.source is not on the lead-source list'); END;

-- Backfill. Every value below is DERIVED from a row that already exists; none
-- is a default standing in for a fact.
UPDATE businesses SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE businesses SET client_status = 'ACTIVE'
 WHERE id IN (SELECT business_id FROM engagements WHERE letter_state = 'SIGNED');
UPDATE businesses SET source = 'WEBSITE'
 WHERE source IS NULL AND EXISTS (SELECT 1 FROM assessments a WHERE a.business_id = businesses.id);


-- ---------------------------------------------------------------------------
-- 2 · CONTACTS — extended. The per-channel consent columns stay as built.
--
-- A CLIENT'S ACCOUNTANT IS A CONTACT, NEVER A USER. The client's own contacts
-- are not third parties (N2): they are the people the client put in front of
-- us. A contact never exists without its organisation — `business_id` has been
-- NOT NULL since migration 003.
-- ---------------------------------------------------------------------------
ALTER TABLE contacts ADD COLUMN contact_type TEXT;
-- Nullable: not recorded is not "no".
ALTER TABLE contacts ADD COLUMN is_decision_maker INTEGER CHECK (is_decision_maker IN (0,1));
ALTER TABLE contacts ADD COLUMN email TEXT;
ALTER TABLE contacts ADD COLUMN phone TEXT;
ALTER TABLE contacts ADD COLUMN last_contact_at TEXT;
ALTER TABLE contacts ADD COLUMN next_follow_up_at TEXT;
-- Internal. ADMIN and SALES only, escaped on output.
ALTER TABLE contacts ADD COLUMN notes TEXT;
ALTER TABLE contacts ADD COLUMN updated_at TEXT;

CREATE TRIGGER contacts_contact_type_insert BEFORE INSERT ON contacts
WHEN NEW.contact_type IS NOT NULL AND NEW.contact_type NOT IN
  ('DECISION_MAKER','FINANCE','ACCOUNTANT','ADVISER','INTRODUCER','OTHER')
BEGIN SELECT RAISE(ABORT, 'contacts.contact_type is not on the contact-type list'); END;

CREATE TRIGGER contacts_contact_type_update BEFORE UPDATE OF contact_type ON contacts
WHEN NEW.contact_type IS NOT NULL AND NEW.contact_type NOT IN
  ('DECISION_MAKER','FINANCE','ACCOUNTANT','ADVISER','INTRODUCER','OTHER')
BEGIN SELECT RAISE(ABORT, 'contacts.contact_type is not on the contact-type list'); END;

UPDATE contacts SET updated_at = created_at WHERE updated_at IS NULL;


-- ---------------------------------------------------------------------------
-- 3 · PROPERTIES — extended.
--
-- `label` STAYS the display label; the funnel wrote the client's own address
-- text there and nothing is copied out of it.
--
-- THE POSTCODE GOES THROUGH src/web/postcode.ts AND NOWHERE ELSE. `jurisdiction`
-- holds a RECORDED nation only; wherever the resolver can derive one from the
-- postcode the store refuses a recorded one, so the question is never asked
-- twice. The rule is in src/web/crm.ts, because the resolver's table is a
-- deployment artefact the database cannot see.
--
-- SURVEY STATUS, DATE AND SURVEYOR ARE NOT HERE. They belong to the CLAIM: one
-- building can be surveyed for one relief and not for another.
--
-- `previous_owner` AND `occupier` ARE A COMPANY NAME OR A ROLE TOKEN, NEVER AN
-- INDIVIDUAL'S NAME (N2). The guard is in src/web/crm.ts, with a test.
-- ---------------------------------------------------------------------------
ALTER TABLE properties ADD COLUMN address_line_1 TEXT;
ALTER TABLE properties ADD COLUMN address_line_2 TEXT;
ALTER TABLE properties ADD COLUMN town TEXT;
ALTER TABLE properties ADD COLUMN jurisdiction TEXT
  CHECK (jurisdiction IN ('england','wales','scotland','northern_ireland'));
-- Free text until CRM 9 of 10 makes both configurable lists. Never defaulted.
ALTER TABLE properties ADD COLUMN property_type TEXT;
ALTER TABLE properties ADD COLUMN property_use TEXT;
ALTER TABLE properties ADD COLUMN tenure TEXT CHECK (tenure IN ('FREEHOLD','LEASEHOLD','UNKNOWN'));
ALTER TABLE properties ADD COLUMN occupier TEXT;
ALTER TABLE properties ADD COLUMN acquisition_date TEXT;
-- Integer pence. A price of nothing is not a price: zero is refused (N4).
ALTER TABLE properties ADD COLUMN acquisition_price_pence INTEGER
  CHECK (acquisition_price_pence IS NULL OR acquisition_price_pence > 0);
ALTER TABLE properties ADD COLUMN completion_date TEXT;
ALTER TABLE properties ADD COLUMN disposal_date TEXT;
ALTER TABLE properties ADD COLUMN previous_owner TEXT;
ALTER TABLE properties ADD COLUMN construction_notes TEXT;
-- YES, NO, UNKNOWN — and NULL, never asked, behaves exactly as UNKNOWN does.
ALTER TABLE properties ADD COLUMN existing_ca_claimed TEXT
  CHECK (existing_ca_claimed IN ('YES','NO','UNKNOWN'));
ALTER TABLE properties ADD COLUMN prior_claim_notes TEXT;
ALTER TABLE properties ADD COLUMN updated_at TEXT;

UPDATE properties SET updated_at = created_at WHERE updated_at IS NULL;

-- The parent keys of the claim's two composite foreign keys below. Each id is
-- already unique on its own, so neither index can refuse an existing row; they
-- exist so that a claim cannot point at ANOTHER organisation's property or
-- assessment.
CREATE UNIQUE INDEX properties_id_business_uq ON properties(id, business_id);
CREATE UNIQUE INDEX assessments_id_business_uq ON assessments(id, business_id);


-- ---------------------------------------------------------------------------
-- 4 · CLAIMS — new. One business, many properties; one property, many claims.
--
-- `claim_ref` IS A HUMAN SERIES — CR-2026-0001 — UNIQUE AND NEVER REUSED. That
-- is only true if nothing can take a number back, so: the series is its own
-- table and cannot go backwards or lose a row; a claim cannot be deleted; and a
-- claim's reference and organisation cannot be changed. All four are refused
-- by the database.
--
-- `workstream` IS FROM THE RULEBOOKS' RELIEFS: plant and machinery (Registers A
-- and D), structures and buildings (Register I §4, Register F), land
-- remediation (Register H). A property with two holds two claims.
--
-- `stage` CARRIES THE SIX KEYS src/web/stages.ts ALREADY HAS, and
-- `businesses.stage` IS NOT MOVED OR RENAMED. CRM 2 of 10 owns the vocabulary
-- and replaces the two stage triggers below. NULL means the business's stored
-- stage was not one this vocabulary recognises, and a screen says so.
--
-- `property_id` IS NULLABLE: a claim can exist before its property is recorded.
-- When it is set, the composite foreign key makes it a property of the SAME
-- organisation. `assessment_id` likewise.
--
-- `surveyor_id` IS A RECORD, NOT AN ACCESS GRANT. SURVEYING reaches a claim
-- only through a survey job on that claim's own assessment (src/authz.ts).
-- ---------------------------------------------------------------------------
CREATE TABLE claim_ref_series (
  year   INTEGER PRIMARY KEY CHECK (year BETWEEN 2000 AND 9999),
  last_n INTEGER NOT NULL CHECK (last_n >= 1)
) STRICT;

CREATE TRIGGER claim_ref_series_never_backwards BEFORE UPDATE ON claim_ref_series
WHEN NEW.last_n <= OLD.last_n OR NEW.year <> OLD.year
BEGIN SELECT RAISE(ABORT, 'a claim reference series only ever moves forward'); END;

CREATE TRIGGER claim_ref_series_no_delete BEFORE DELETE ON claim_ref_series
BEGIN SELECT RAISE(ABORT, 'a claim reference series is never deleted: a reference is never reused'); END;

CREATE TABLE claims (
  id                  TEXT PRIMARY KEY,
  claim_ref           TEXT NOT NULL UNIQUE
                        CHECK (claim_ref GLOB 'CR-[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9]*'),
  business_id         TEXT NOT NULL REFERENCES businesses(id),
  property_id         TEXT,
  assessment_id       TEXT,
  workstream          TEXT NOT NULL,
  stage               TEXT,
  owner_id            TEXT REFERENCES users(id),
  surveyor_id         TEXT REFERENCES users(id),
  -- LOW, NORMAL, HIGH — validated in code so CRM 9 can make it configurable.
  priority            TEXT,
  next_action         TEXT,
  next_action_due     TEXT,
  hold_reason         TEXT,
  lost_reason         TEXT,
  expected_completion TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  FOREIGN KEY (property_id, business_id) REFERENCES properties(id, business_id),
  FOREIGN KEY (assessment_id, business_id) REFERENCES assessments(id, business_id)
) STRICT;

CREATE INDEX claims_business_idx ON claims(business_id);
CREATE INDEX claims_property_idx ON claims(property_id);

CREATE TRIGGER claims_workstream_insert BEFORE INSERT ON claims
WHEN NEW.workstream NOT IN ('PLANT_AND_MACHINERY','STRUCTURES_AND_BUILDINGS','LAND_REMEDIATION','UNKNOWN')
BEGIN SELECT RAISE(ABORT, 'claims.workstream is not one of the rulebooks'' reliefs'); END;

CREATE TRIGGER claims_workstream_update BEFORE UPDATE OF workstream ON claims
WHEN NEW.workstream NOT IN ('PLANT_AND_MACHINERY','STRUCTURES_AND_BUILDINGS','LAND_REMEDIATION','UNKNOWN')
BEGIN SELECT RAISE(ABORT, 'claims.workstream is not one of the rulebooks'' reliefs'); END;

-- CRM 2 of 10 REPLACES THESE TWO, and nothing else, to change the vocabulary.
CREATE TRIGGER claims_stage_insert BEFORE INSERT ON claims
WHEN NEW.stage IS NOT NULL AND NEW.stage NOT IN
  ('ASSESSMENT_SUBMITTED','RESEARCH_PART_RUN','ENGAGEMENT_SIGNED','AT_SURVEY','INVOICED','PAID')
BEGIN SELECT RAISE(ABORT, 'claims.stage is not a key src/web/stages.ts knows'); END;

CREATE TRIGGER claims_stage_update BEFORE UPDATE OF stage ON claims
WHEN NEW.stage IS NOT NULL AND NEW.stage NOT IN
  ('ASSESSMENT_SUBMITTED','RESEARCH_PART_RUN','ENGAGEMENT_SIGNED','AT_SURVEY','INVOICED','PAID')
BEGIN SELECT RAISE(ABORT, 'claims.stage is not a key src/web/stages.ts knows'); END;

CREATE TRIGGER claims_reference_is_permanent BEFORE UPDATE OF claim_ref, business_id ON claims
WHEN NEW.claim_ref IS NOT OLD.claim_ref OR NEW.business_id IS NOT OLD.business_id
BEGIN SELECT RAISE(ABORT, 'a claim keeps its reference and its organisation for ever'); END;

CREATE TRIGGER claims_never_deleted BEFORE DELETE ON claims
BEGIN SELECT RAISE(ABORT, 'a claim is never deleted: it is closed, lost or cancelled, and the record stays'); END;

-- Backfill: ONE CLAIM PER EXISTING BUSINESS, so every screen and test that
-- reads a business keeps working unchanged. Every column is derived:
--   the reference   numbered in order of the business's own creation, per year
--   the property    the business's first, by creation
--   the assessment  its latest
--   the workstream  PLANT_AND_MACHINERY where a sealed estimate exists — the
--                   engine's indicative estimate IS a plant and machinery
--                   figure (qualifying expenditure and a main/special pool
--                   split) — and UNKNOWN where there is none
--   the stage       the business's own, where stages.ts knows it
--   the surveyor    the surveyor on its latest assigned survey job
INSERT INTO claims (id, claim_ref, business_id, property_id, assessment_id, workstream, stage,
                    owner_id, surveyor_id, created_at, updated_at)
SELECT
  lower(hex(randomblob(16))),
  printf('CR-%s-%04d', strftime('%Y', b.created_at),
         ROW_NUMBER() OVER (PARTITION BY strftime('%Y', b.created_at) ORDER BY b.created_at, b.id)),
  b.id,
  (SELECT p.id FROM properties p WHERE p.business_id = b.id ORDER BY p.created_at, p.id LIMIT 1),
  (SELECT a.id FROM assessments a WHERE a.business_id = b.id ORDER BY a.submitted_at DESC, a.id DESC LIMIT 1),
  CASE WHEN EXISTS (SELECT 1 FROM estimates e WHERE e.business_id = b.id)
       THEN 'PLANT_AND_MACHINERY' ELSE 'UNKNOWN' END,
  CASE WHEN b.stage IN ('ASSESSMENT_SUBMITTED','RESEARCH_PART_RUN','ENGAGEMENT_SIGNED',
                        'AT_SURVEY','INVOICED','PAID') THEN b.stage ELSE NULL END,
  NULL,
  (SELECT j.surveyor_id FROM surveyor_jobs j
    WHERE j.business_id = b.id AND j.surveyor_id IS NOT NULL
    ORDER BY j.created_at DESC LIMIT 1),
  b.created_at,
  b.created_at
FROM businesses b;

INSERT INTO claim_ref_series (year, last_n)
SELECT CAST(substr(claim_ref, 4, 4) AS INTEGER), MAX(CAST(substr(claim_ref, 9) AS INTEGER))
  FROM claims GROUP BY substr(claim_ref, 4, 4);


-- ---------------------------------------------------------------------------
-- 5 · THE OUTBOX REFUSES A DO_NOT_CONTACT ORGANISATION — AT THE DATABASE.
--
-- src/stubs/email.ts refuses first and writes nothing. This trigger is the
-- second place, for the caller that goes round the transport: a row addressed
-- to a DO_NOT_CONTACT organisation, or to ANY address that organisation holds —
-- its contact channel, one of its contacts, or a client login belonging to it —
-- is aborted, whatever wrote it. The same four tests are in the transport, in
-- the same order, so the two cannot disagree.
-- ---------------------------------------------------------------------------
ALTER TABLE outbox ADD COLUMN business_id TEXT REFERENCES businesses(id);

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
