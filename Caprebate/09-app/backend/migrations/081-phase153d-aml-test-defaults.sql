-- ===========================================================================
-- 081 — THE MONEY-LAUNDERING CHECK'S TEST DEFAULTS                Phase 153d, 4 October 2026
--
-- Word question 45 (the director's, for the solicitor): built on our recommendation, in the test system, as TEST
-- DEFAULTS, NOT AGREED. Three changes to cdd_checks, and nothing else:
--   1. claimant_type gains ORDINARY_PARTNERSHIP, LLP and TRUST beside the six it had.
--   2. risk_level: LOW, MEDIUM or HIGH, beside the risk in words (risk_rating), which stays as it was.
--   3. authority_basis gains DESIGNATED_MEMBER, for an LLP.
-- The 25% ownership threshold is guidance on the check page (src/web/compliance-aml.ts, AML_TEST_DEFAULTS), not a column.
--
-- A CHECK constraint cannot be changed in place, so the table is rebuilt the way migration 007 rebuilt `businesses`:
-- foreign keys off FIRST (a no-op inside a transaction), one transaction, every row copied, the old table dropped and
-- the new one renamed, its index and its five triggers made again exactly as migration 017 made them, then the guard:
-- zero foreign key violations, or none of this happens.
-- ===========================================================================

PRAGMA foreign_keys = OFF;

BEGIN;

CREATE TABLE cdd_checks_new (
  id                    TEXT PRIMARY KEY,
  business_id           TEXT NOT NULL REFERENCES businesses(id),
  claim_id              TEXT,
  claimant_type         TEXT NOT NULL CHECK (claimant_type IN
                          ('LIMITED_COMPANY','GP_PARTNERSHIP','SOLE_TRADER','CHARITY','INDIVIDUAL_OWNER','OTHER',
                           'ORDINARY_PARTNERSHIP','LLP','TRUST')),
  claimant_type_note    TEXT,
  -- What was identified, and how it was verified — in words, because the paper's section 5 differs by type.
  identified            TEXT,
  verification_method   TEXT,
  -- A Companies House or Charity Commission number. An organisation's, never a person's.
  register_ref          TEXT,
  -- The evidence document: a document on the organisation, of a CRM 4 of 10 type.
  evidence_document_id  TEXT REFERENCES documents(id),
  beneficial_ownership  TEXT CHECK (beneficial_ownership IN ('RECORDED','NOT_APPLICABLE_INDIVIDUAL')),
  authority_basis       TEXT CHECK (authority_basis IN
                          ('DIRECTOR','PARTNER','PROPRIETOR','TRUSTEE_OR_AUTHORISED_OFFICER','LEGAL_OWNER_IN_PERSON','OTHER','DESIGNATED_MEMBER')),
  authority_contact_id  TEXT REFERENCES contacts(id),
  authority_evidence    TEXT,
  entity_status         TEXT CHECK (entity_status IN ('ACTIVE','NOT_ACTIVE','NOT_APPLICABLE')),
  sanctions_screen      TEXT CHECK (sanctions_screen IN ('NO_MATCH','POSSIBLE_MATCH')),
  sanctions_screened_on TEXT CHECK (sanctions_screened_on IS NULL OR sanctions_screened_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  -- Words, as before (Phase 153d: beside the level below, never instead of it).
  risk_rating           TEXT,
  -- PHASE 153d: the three-level scale, a TEST DEFAULT, not agreed (Word question 45). Null: not rated yet.
  risk_level            TEXT CHECK (risk_level IS NULL OR risk_level IN ('LOW','MEDIUM','HIGH')),
  risk_rating_basis     TEXT,
  checked_on            TEXT CHECK (checked_on IS NULL OR checked_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  checked_by            TEXT REFERENCES users(id),
  state                 TEXT NOT NULL CHECK (state IN ('IN_PROGRESS','COMPLETE','WITHDRAWN')),
  completed_at          TEXT,
  withdrawn_reason      TEXT,
  created_by            TEXT NOT NULL REFERENCES users(id),
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  FOREIGN KEY (claim_id, business_id) REFERENCES claims(id, business_id),
  CHECK (claimant_type <> 'OTHER' OR (claimant_type_note IS NOT NULL AND length(trim(claimant_type_note)) > 0)),
  CHECK (sanctions_screen IS NULL OR sanctions_screened_on IS NOT NULL),
  CHECK (state <> 'COMPLETE' OR (
           completed_at IS NOT NULL AND identified IS NOT NULL AND verification_method IS NOT NULL
           AND (evidence_document_id IS NOT NULL OR register_ref IS NOT NULL)
           AND beneficial_ownership IS NOT NULL AND authority_basis IS NOT NULL AND authority_evidence IS NOT NULL
           AND checked_on IS NOT NULL AND checked_by IS NOT NULL)),
  CHECK (state = 'COMPLETE' OR completed_at IS NULL),
  CHECK (state <> 'WITHDRAWN' OR (withdrawn_reason IS NOT NULL AND length(trim(withdrawn_reason)) > 0))
) STRICT;

INSERT INTO cdd_checks_new (id, business_id, claim_id, claimant_type, claimant_type_note, identified, verification_method, register_ref, evidence_document_id, beneficial_ownership, authority_basis, authority_contact_id, authority_evidence, entity_status, sanctions_screen, sanctions_screened_on, risk_rating, risk_rating_basis, checked_on, checked_by, state, completed_at, withdrawn_reason, created_by, created_at, updated_at)
SELECT id, business_id, claim_id, claimant_type, claimant_type_note, identified, verification_method, register_ref, evidence_document_id, beneficial_ownership, authority_basis, authority_contact_id, authority_evidence, entity_status, sanctions_screen, sanctions_screened_on, risk_rating, risk_rating_basis, checked_on, checked_by, state, completed_at, withdrawn_reason, created_by, created_at, updated_at FROM cdd_checks;

-- Two triggers on other tables read cdd_checks in their bodies. They go first and are made again below, word for word
-- as migration 017 made them, or the rename would find them pointing at a table that is not there.
DROP TRIGGER cdd_psc_decisions_the_organisations_psc_pull;
DROP TRIGGER cdd_beneficial_owners_on_an_open_check_of_that_organisation;

DROP TABLE cdd_checks;

ALTER TABLE cdd_checks_new RENAME TO cdd_checks;

CREATE INDEX cdd_checks_business_idx ON cdd_checks(business_id, state);

CREATE TRIGGER cdd_checks_finished_is_final BEFORE UPDATE ON cdd_checks
WHEN OLD.state IN ('COMPLETE','WITHDRAWN')
BEGIN SELECT RAISE(ABORT, 'a finished or withdrawn check is kept as it was: open a new check instead'); END;

CREATE TRIGGER cdd_checks_no_delete BEFORE DELETE ON cdd_checks
BEGIN SELECT RAISE(ABORT, 'a due diligence check is withdrawn, never deleted'); END;

CREATE TRIGGER cdd_checks_evidence_is_the_organisations BEFORE UPDATE OF evidence_document_id ON cdd_checks
WHEN NEW.evidence_document_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.id = NEW.evidence_document_id AND d.business_id = NEW.business_id)
BEGIN SELECT RAISE(ABORT, 'the evidence document must be a document on the same organisation'); END;

CREATE TRIGGER cdd_checks_authority_is_a_contact_of_the_organisation BEFORE UPDATE OF authority_contact_id ON cdd_checks
WHEN NEW.authority_contact_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = NEW.authority_contact_id AND c.business_id = NEW.business_id)
BEGIN SELECT RAISE(ABORT, 'the person with authority to bind must be one of the organisation''s own contacts'); END;

CREATE TRIGGER cdd_checks_complete_needs_its_owners BEFORE UPDATE OF state ON cdd_checks
WHEN NEW.state = 'COMPLETE' AND NEW.beneficial_ownership = 'RECORDED'
 AND NOT EXISTS (SELECT 1 FROM cdd_beneficial_owners o WHERE o.check_id = NEW.id)
BEGIN SELECT RAISE(ABORT, 'a check that records beneficial ownership needs at least one beneficial owner recorded on it'); END;

CREATE TRIGGER cdd_psc_decisions_the_organisations_psc_pull BEFORE INSERT ON cdd_psc_decisions
WHEN NOT EXISTS (
  SELECT 1 FROM research_sources rs JOIN cdd_checks k ON k.id = NEW.check_id
   WHERE rs.id = NEW.research_source_id AND rs.source_id = 'CH_PSC' AND rs.business_id = k.business_id)
BEGIN SELECT RAISE(ABORT, 'a PSC decision cross-references the same organisation''s Companies House PSC pull, and no other source'); END;

CREATE TRIGGER cdd_beneficial_owners_on_an_open_check_of_that_organisation BEFORE INSERT ON cdd_beneficial_owners
WHEN NOT EXISTS (
  SELECT 1 FROM cdd_checks k JOIN contacts c ON c.id = NEW.contact_id
   WHERE k.id = NEW.check_id AND k.state = 'IN_PROGRESS' AND c.business_id = k.business_id)
BEGIN SELECT RAISE(ABORT, 'a beneficial owner is one of the organisation''s own contacts, recorded on an open check'); END;

CREATE TABLE _fk_check_guard (ok INTEGER NOT NULL CHECK (ok = 0)) STRICT;
INSERT INTO _fk_check_guard (ok) SELECT count(*) FROM pragma_foreign_key_check;
DROP TABLE _fk_check_guard;

COMMIT;

PRAGMA foreign_keys = ON;
