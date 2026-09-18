-- ===========================================================================
-- 017 — THE COMPLIANCE REGISTERS: CUSTOMER DUE DILIGENCE (BUILT AND OFF), THE
-- RIGHTS-REQUEST REGISTER, THE COMPLAINTS LOG, THE BREACH REGISTER, S2 THE
-- IDENTITY STORE, ONE CONSENT HISTORY, AND THE CLIENT'S OWN ROUTE TO THE
-- SHARE-PROGRESS OPT-IN.                              CRM 8 of 10, 12 Sep 2026
--
-- The scope is 09-app/CAPREBATE-CRM-DISPOSITION.md, row B3, and every choice
-- below that is not obvious is a row of its Part E from E94. The code is
-- src/web/compliance.ts and src/web/compliance-clock.ts; the pages are
-- src/web/compliance-pages.ts. Built to the documents already written, in
-- 08-monday-doc-exports: the AML/KYC Position Paper (12830178449), the
-- Rights-Request Register, Complaints Log and s.164A pack (12927908435), the
-- Personal Data Breach Register and Incident Response Procedure (12927581028)
-- with the ICO pre-filled answer sheet (12927942615), the Retention
-- Determinations (12945903194), the Retention and Rights-Request Operating
-- Procedure (12818099921), the Dashboard Data Specification (12948738680) and
-- the Article 14 Assessment (12927987812).
--
-- THIS BUILDS THE STORE. IT MOVES NO LIVE DATA. The restricted breach register
-- board and its names annex stay where they are, and nothing here reads them.
--
-- EXTENDED, NEVER REBUILT — WITH ONE REBUILD, AND IT IS A CHECK SQLITE CANNOT
-- WIDEN IN PLACE, following migrations 011, 014 and 016 to the letter:
--   `introducer_share_consents` gains the route CLIENT_PORTAL, so the client
--     gives or withdraws the opt-in themselves, writing the same table. Every
--     existing row is copied unchanged. The one trigger on another table that
--     reads it — introducer_notices' opt-in guard — is dropped and re-created
--     character for character, as 014 did for the outbox control.
--   `email_templates`' named trigger pair is replaced by name and widened by the
--     words that would tip somebody off; nothing else about it changes.
--
-- WHAT IS NOT IN THIS FILE, ON PURPOSE
--   A COMPUTED DEADLINE, A RETENTION DATE OR A "DUE" FLAG. Every statutory clock
--     is READ from its inputs by src/web/compliance-clock.ts, with the arithmetic
--     shown; every retention clock is read from its parameter, and no parameter
--     is approved.
--   A DELETER. Nothing here deletes a record; the identity store and every
--     register refuse a DELETE. Whether client-document folders can be kept out
--     of the host's backup is still open, and a file alive in a backup has not
--     been deleted.
--   A NAME IN THE CLAIM RECORD. S2 holds the names of people printed on
--     documents, under an opaque person_ref, and nothing copies one out.
--   A RISK-RATING SCALE, AN OWNERSHIP THRESHOLD OR A SUSPICION REPORT. The
--     position paper names none of them; a scale typed here would be a guess.
--   A DATA PROTECTION OFFICER'S LOGIN. There is no such role. A decision-maker
--     and a countersignatory are NAMED in text, and the person who typed the
--     row is `recorded_by`. The two-person check is one person today, and the
--     pages say so rather than presenting it as a check.
-- ===========================================================================

-- 1 · foreign keys off. A no-op inside a transaction, so it goes FIRST.
PRAGMA foreign_keys = OFF;

-- 2 · one transaction. All of it, or none of it.
BEGIN;


-- ---------------------------------------------------------------------------
-- 3 · THE COMPLIANCE SETTINGS — dated, sourced, append-only, as finance_settings
--
-- The current value is the latest row in effect on the day asked about. NO ROW
-- READS EXACTLY AS THE SHIPPED VALUE WHERE THE SHIPPED VALUE IS "OFF", and a
-- setting nobody recorded never reads as a policy in force.
-- ---------------------------------------------------------------------------
CREATE TABLE compliance_settings (
  id             TEXT PRIMARY KEY,
  setting        TEXT NOT NULL CHECK (setting IN ('AML_IN_SCOPE','INSURANCE_POSITION')),
  value          TEXT NOT NULL,
  effective_from TEXT NOT NULL CHECK (effective_from GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  source         TEXT NOT NULL CHECK (length(trim(source)) BETWEEN 2 AND 1000),
  -- NULL only on the rows this migration writes from documents.
  recorded_by    TEXT REFERENCES users(id),
  recorded_at    TEXT NOT NULL,
  CHECK (setting <> 'AML_IN_SCOPE' OR value IN ('true','false')),
  CHECK (setting <> 'INSURANCE_POSITION' OR value IN ('NO_POLICY_IN_FORCE','POLICY_IN_FORCE'))
) STRICT;

CREATE INDEX compliance_settings_setting_idx ON compliance_settings(setting, effective_from);

CREATE TRIGGER compliance_settings_no_update BEFORE UPDATE ON compliance_settings
BEGIN SELECT RAISE(ABORT, 'compliance_settings is append-only: record a new dated value instead'); END;

CREATE TRIGGER compliance_settings_no_delete BEFORE DELETE ON compliance_settings
BEGIN SELECT RAISE(ABORT, 'compliance_settings is append-only: record a new dated value instead'); END;

INSERT INTO compliance_settings (id, setting, value, effective_from, source, recorded_by, recorded_at) VALUES
  ('setting-aml-in-scope-shipped', 'AML_IN_SCOPE', 'false', '2026-09-12',
   'Shipped off by CRM 8 of 10. Whether supervision under the Money Laundering Regulations is required is with the accountant and a solicitor: the AML/KYC Position Paper, section 4, reads it as more likely than not and says not to rely on that until a solicitor or HMRC confirms it in writing. The question is "Is AML supervision legally required for this business?"',
   NULL, '2026-09-12T00:00:00.000Z'),
  ('setting-insurance-position-2026-08-31', 'INSURANCE_POSITION', 'NO_POLICY_IN_FORCE', '2026-08-31',
   'The ICO breach report pre-filled answer sheet, section 4.6: no professional indemnity, public liability or cyber policy is in force, and the broker brief is drafted and unsent.',
   NULL, '2026-09-12T00:00:00.000Z');


-- ---------------------------------------------------------------------------
-- 4 · THE REFERENCE SERIES — RR-nnn, CP-nnn, PDB-nnn. Never reused, never renumbered.
-- ---------------------------------------------------------------------------
CREATE TABLE compliance_ref_series (
  kind   TEXT PRIMARY KEY CHECK (kind IN ('RR','CP','PDB')),
  last_n INTEGER NOT NULL CHECK (last_n >= 0)
) STRICT;

INSERT INTO compliance_ref_series (kind, last_n) VALUES ('RR', 0), ('CP', 0), ('PDB', 0);

CREATE TRIGGER compliance_ref_series_forward_only BEFORE UPDATE ON compliance_ref_series
WHEN NEW.last_n <> OLD.last_n + 1 OR NEW.kind <> OLD.kind
BEGIN SELECT RAISE(ABORT, 'a register reference series moves forward by one and is never reused'); END;

CREATE TRIGGER compliance_ref_series_no_delete BEFORE DELETE ON compliance_ref_series
BEGIN SELECT RAISE(ABORT, 'a register reference series is never deleted'); END;


-- ---------------------------------------------------------------------------
-- 5 · CUSTOMER DUE DILIGENCE — BUILT, AND OFF (AML/KYC Position Paper, sections 5 and 6)
--
-- OFF, NOTHING HERE BLOCKS A CLAIM. ON, a claim cannot leave ENGAGEMENT without a
-- finished check for its organisation (src/web/pipeline.ts reads it).
--
-- PER CLAIMANT TYPE, AS THE PAPER'S SECTION 5 LISTS THEM — five, and OTHER with
-- a note, because an LLP or a trust is not in the paper and a type typed here
-- would be a rule nobody wrote.
--
-- THE PEOPLE ARE CONTACTS. A beneficial owner or the person with authority to
-- bind is one of the client's own contacts — the one table a client-side person
-- lives in — and never a second copy of a name here.
--
-- PSC DATA PULLED FOR THE ALLOWANCE COMMON-CONTROL TEST DOES NOT STAND FOR
-- BENEFICIAL OWNERSHIP. An owner identified from that pull needs a separate,
-- dated decision that cross-references the pull (paper, section 5), and the
-- database refuses the owner — and the finished check — without it.
-- ---------------------------------------------------------------------------
CREATE TABLE aml_officers (
  id            TEXT PRIMARY KEY,
  office        TEXT NOT NULL CHECK (office IN ('NOMINATED_OFFICER','COMPLIANCE_OFFICER')),
  user_id       TEXT NOT NULL REFERENCES users(id),
  appointed_on  TEXT NOT NULL CHECK (appointed_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  -- Where the appointment is named in writing (paper, section 5).
  source        TEXT NOT NULL CHECK (length(trim(source)) BETWEEN 2 AND 1000),
  ended_on      TEXT CHECK (ended_on IS NULL OR ended_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  recorded_by   TEXT NOT NULL REFERENCES users(id),
  recorded_at   TEXT NOT NULL,
  CHECK (ended_on IS NULL OR ended_on >= appointed_on)
) STRICT;

CREATE TRIGGER aml_officers_only_ends BEFORE UPDATE ON aml_officers
WHEN OLD.ended_on IS NOT NULL OR NEW.id IS NOT OLD.id OR NEW.office IS NOT OLD.office OR NEW.user_id IS NOT OLD.user_id
  OR NEW.appointed_on IS NOT OLD.appointed_on OR NEW.source IS NOT OLD.source
  OR NEW.recorded_by IS NOT OLD.recorded_by OR NEW.recorded_at IS NOT OLD.recorded_at
BEGIN SELECT RAISE(ABORT, 'an appointment is recorded once and may only be ended, once'); END;

CREATE TRIGGER aml_officers_no_delete BEFORE DELETE ON aml_officers
BEGIN SELECT RAISE(ABORT, 'an appointment is ended, never deleted'); END;

CREATE TABLE aml_firm_risk_assessments (
  id                    TEXT PRIMARY KEY,
  assessed_on           TEXT NOT NULL CHECK (assessed_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  -- Where the dated document is. It is Caprebate's own document, not a client's.
  document_ref          TEXT NOT NULL CHECK (length(trim(document_ref)) BETWEEN 2 AND 500),
  -- Client types, geographic reach, delivery channels, products and services (paper, section 5).
  covers                TEXT NOT NULL CHECK (length(trim(covers)) BETWEEN 2 AND 2000),
  -- The paper requires the contingent fee to be named as a risk factor.
  contingent_fee_named  INTEGER NOT NULL CHECK (contingent_fee_named IN (0,1)),
  recorded_by           TEXT NOT NULL REFERENCES users(id),
  recorded_at           TEXT NOT NULL
) STRICT;

CREATE TRIGGER aml_firm_risk_assessments_no_update BEFORE UPDATE ON aml_firm_risk_assessments
BEGIN SELECT RAISE(ABORT, 'a firm-wide risk assessment is dated and kept: record the next one instead'); END;

CREATE TRIGGER aml_firm_risk_assessments_no_delete BEFORE DELETE ON aml_firm_risk_assessments
BEGIN SELECT RAISE(ABORT, 'a firm-wide risk assessment is dated and kept: record the next one instead'); END;

CREATE TABLE cdd_checks (
  id                    TEXT PRIMARY KEY,
  business_id           TEXT NOT NULL REFERENCES businesses(id),
  claim_id              TEXT,
  claimant_type         TEXT NOT NULL CHECK (claimant_type IN
                          ('LIMITED_COMPANY','GP_PARTNERSHIP','SOLE_TRADER','CHARITY','INDIVIDUAL_OWNER','OTHER')),
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
                          ('DIRECTOR','PARTNER','PROPRIETOR','TRUSTEE_OR_AUTHORISED_OFFICER','LEGAL_OWNER_IN_PERSON','OTHER')),
  authority_contact_id  TEXT REFERENCES contacts(id),
  authority_evidence    TEXT,
  entity_status         TEXT CHECK (entity_status IN ('ACTIVE','NOT_ACTIVE','NOT_APPLICABLE')),
  sanctions_screen      TEXT CHECK (sanctions_screen IN ('NO_MATCH','POSSIBLE_MATCH')),
  sanctions_screened_on TEXT CHECK (sanctions_screened_on IS NULL OR sanctions_screened_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  -- NO SCALE: the paper names none. Words, or nothing — never a level typed to fill a column.
  risk_rating           TEXT,
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

CREATE TABLE cdd_psc_decisions (
  id                  TEXT PRIMARY KEY,
  check_id            TEXT NOT NULL REFERENCES cdd_checks(id),
  -- THE PULL: the organisation's Companies House persons-with-significant-control source row.
  research_source_id  TEXT NOT NULL REFERENCES research_sources(id),
  -- Copied from the pull when the decision is made, so the decision says which pull it read.
  pull_retrieved_at   TEXT,
  decision            TEXT NOT NULL CHECK (decision IN ('RELIED_ON_FOR_BENEFICIAL_OWNERSHIP','NOT_RELIED_ON')),
  reasoning           TEXT NOT NULL CHECK (length(trim(reasoning)) BETWEEN 2 AND 4000),
  decided_on          TEXT NOT NULL CHECK (decided_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  decided_by          TEXT NOT NULL REFERENCES users(id),
  recorded_at         TEXT NOT NULL
) STRICT;

CREATE INDEX cdd_psc_decisions_check_idx ON cdd_psc_decisions(check_id);

CREATE TRIGGER cdd_psc_decisions_no_update BEFORE UPDATE ON cdd_psc_decisions
BEGIN SELECT RAISE(ABORT, 'a PSC decision is dated and kept: record a new decision instead'); END;

CREATE TRIGGER cdd_psc_decisions_no_delete BEFORE DELETE ON cdd_psc_decisions
BEGIN SELECT RAISE(ABORT, 'a PSC decision is dated and kept: record a new decision instead'); END;

CREATE TRIGGER cdd_psc_decisions_the_organisations_psc_pull BEFORE INSERT ON cdd_psc_decisions
WHEN NOT EXISTS (
  SELECT 1 FROM research_sources rs JOIN cdd_checks k ON k.id = NEW.check_id
   WHERE rs.id = NEW.research_source_id AND rs.source_id = 'CH_PSC' AND rs.business_id = k.business_id)
BEGIN SELECT RAISE(ABORT, 'a PSC decision cross-references the same organisation''s Companies House PSC pull, and no other source'); END;

CREATE TABLE cdd_beneficial_owners (
  id                    TEXT PRIMARY KEY,
  check_id              TEXT NOT NULL REFERENCES cdd_checks(id),
  contact_id            TEXT NOT NULL REFERENCES contacts(id),
  -- The ownership or control as the evidence shows it. No threshold: the paper names none.
  basis_of_control      TEXT NOT NULL CHECK (length(trim(basis_of_control)) BETWEEN 2 AND 1000),
  identified_from       TEXT NOT NULL CHECK (identified_from IN ('EVIDENCE_DOCUMENT','PSC_PULL')),
  evidence_document_id  TEXT REFERENCES documents(id),
  psc_decision_id       TEXT REFERENCES cdd_psc_decisions(id),
  verified_how          TEXT,
  recorded_by           TEXT NOT NULL REFERENCES users(id),
  recorded_at           TEXT NOT NULL,
  CHECK (identified_from <> 'EVIDENCE_DOCUMENT' OR evidence_document_id IS NOT NULL),
  CHECK (identified_from <> 'PSC_PULL' OR psc_decision_id IS NOT NULL)
) STRICT;

CREATE INDEX cdd_beneficial_owners_check_idx ON cdd_beneficial_owners(check_id);

CREATE TRIGGER cdd_beneficial_owners_no_update BEFORE UPDATE ON cdd_beneficial_owners
BEGIN SELECT RAISE(ABORT, 'a recorded beneficial owner is kept: open a new check if the ownership changed'); END;

CREATE TRIGGER cdd_beneficial_owners_no_delete BEFORE DELETE ON cdd_beneficial_owners
BEGIN SELECT RAISE(ABORT, 'a recorded beneficial owner is kept: open a new check if the ownership changed'); END;

CREATE TRIGGER cdd_beneficial_owners_on_an_open_check_of_that_organisation BEFORE INSERT ON cdd_beneficial_owners
WHEN NOT EXISTS (
  SELECT 1 FROM cdd_checks k JOIN contacts c ON c.id = NEW.contact_id
   WHERE k.id = NEW.check_id AND k.state = 'IN_PROGRESS' AND c.business_id = k.business_id)
BEGIN SELECT RAISE(ABORT, 'a beneficial owner is one of the organisation''s own contacts, recorded on an open check'); END;

-- THE SEPARATION, IN THE DATABASE: an owner from the PSC pull needs THIS check's own decision to rely on it.
CREATE TRIGGER cdd_beneficial_owners_psc_needs_its_own_decision BEFORE INSERT ON cdd_beneficial_owners
WHEN NEW.identified_from = 'PSC_PULL' AND NOT EXISTS (
  SELECT 1 FROM cdd_psc_decisions p
   WHERE p.id = NEW.psc_decision_id AND p.check_id = NEW.check_id AND p.decision = 'RELIED_ON_FOR_BENEFICIAL_OWNERSHIP')
BEGIN SELECT RAISE(ABORT, 'E_PSC_NOT_BENEFICIAL_OWNERSHIP: PSC data pulled for the common-control test does not stand for beneficial ownership without a dated decision on this check to rely on it'); END;

CREATE TRIGGER cdd_checks_complete_needs_its_owners BEFORE UPDATE OF state ON cdd_checks
WHEN NEW.state = 'COMPLETE' AND NEW.beneficial_ownership = 'RECORDED'
 AND NOT EXISTS (SELECT 1 FROM cdd_beneficial_owners o WHERE o.check_id = NEW.id)
BEGIN SELECT RAISE(ABORT, 'a check that records beneficial ownership needs at least one beneficial owner recorded on it'); END;

CREATE TABLE cdd_monitoring_notes (
  id           TEXT PRIMARY KEY,
  business_id  TEXT NOT NULL REFERENCES businesses(id),
  check_id     TEXT REFERENCES cdd_checks(id),
  noted_on     TEXT NOT NULL CHECK (noted_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  note         TEXT NOT NULL CHECK (length(trim(note)) BETWEEN 2 AND 4000),
  recorded_by  TEXT NOT NULL REFERENCES users(id),
  recorded_at  TEXT NOT NULL
) STRICT;

CREATE INDEX cdd_monitoring_notes_business_idx ON cdd_monitoring_notes(business_id);

CREATE TRIGGER cdd_monitoring_notes_no_update BEFORE UPDATE ON cdd_monitoring_notes
BEGIN SELECT RAISE(ABORT, 'cdd_monitoring_notes is append-only'); END;

CREATE TRIGGER cdd_monitoring_notes_no_delete BEFORE DELETE ON cdd_monitoring_notes
BEGIN SELECT RAISE(ABORT, 'cdd_monitoring_notes is append-only'); END;


-- ---------------------------------------------------------------------------
-- 6 · S2 — THE IDENTITY STORE (Dashboard Data Specification, section 3.2; Retention Procedure 2.3B)
--
-- THE PEOPLE PRINTED ON A DOCUMENT A CLIENT UPLOADED — a party, a witness, a
-- signatory, a certifier — and nobody else. The client's own people are contacts,
-- and S2 never holds them (N10).
--
-- person_ref IS OPAQUE AND GENERATED, never typed: a value shaped like a name is
-- refused by the CHECK (A3). THE NAME AND THE CONTACT ROUTE ARE AS PRINTED ON THE
-- DOCUMENT and never looked up, enriched or bought (N5).
--
-- THE ROUTE GROUP, THE DOCUMENT TYPE, WHEN IT WAS RECEIVED AND THE RETENTION DATE
-- ARE READ, NOT STORED — from the contact route, the document and the S1 record
-- this row makes findable (`source_record_ref`, RET-8). A HOLD is a legal_holds row.
--
-- NOTHING DELETES A ROW HERE, AND NOTHING MARKS ONE DELETED. The deletion is not
-- automated in this build; the list of what is due is.
-- ---------------------------------------------------------------------------
CREATE TABLE identity_persons (
  person_ref             TEXT PRIMARY KEY CHECK (length(person_ref) = 19 AND person_ref GLOB 'PR-[0-9A-Z][0-9A-Z][0-9A-Z][0-9A-Z][0-9A-Z][0-9A-Z][0-9A-Z][0-9A-Z][0-9A-Z][0-9A-Z][0-9A-Z][0-9A-Z][0-9A-Z][0-9A-Z][0-9A-Z][0-9A-Z]'),
  name                   TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  role                   TEXT NOT NULL CHECK (role IN
                           ('TRANSACTION_PARTY','ATTESTING_WITNESS','INDIVIDUAL_SIGNATORY','PROFESSIONAL_CERTIFIER')),
  contact_route          TEXT CHECK (contact_route IS NULL OR length(trim(contact_route)) BETWEEN 1 AND 500),
  contact_route_kind     TEXT CHECK (contact_route_kind IN ('POSTAL','EMAIL')),
  purpose                TEXT NOT NULL DEFAULT 'ART14_TRANSPARENCY_AND_RIGHTS'
                           CHECK (purpose = 'ART14_TRANSPARENCY_AND_RIGHTS'),
  doc_id                 TEXT NOT NULL REFERENCES documents(id),
  -- The S1 record whose retention this row inherits (RET-8). Today, the document version itself.
  source_record_ref      TEXT NOT NULL REFERENCES documents(id),
  notice_template        TEXT,
  notice_route           TEXT CHECK (notice_route IN ('DIRECT_POST','DIRECT_EMAIL','CLIENT_ROUTE')),
  notice_sent_on         TEXT CHECK (notice_sent_on IS NULL OR notice_sent_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  exemption_article      TEXT,
  exemption_reason       TEXT,
  exemption_recorded_by  TEXT REFERENCES users(id),
  exemption_recorded_at  TEXT,
  deleted_at             TEXT,
  deletion_ref           TEXT,
  recorded_by            TEXT NOT NULL REFERENCES users(id),
  recorded_at            TEXT NOT NULL,
  updated_at             TEXT NOT NULL,
  CHECK ((contact_route IS NULL) = (contact_route_kind IS NULL)),
  CHECK ((notice_template IS NULL) = (notice_route IS NULL) AND (notice_route IS NULL) = (notice_sent_on IS NULL)),
  CHECK ((exemption_article IS NULL) = (exemption_reason IS NULL)
         AND (exemption_reason IS NULL) = (exemption_recorded_by IS NULL)
         AND (exemption_recorded_by IS NULL) = (exemption_recorded_at IS NULL)),
  CHECK (deleted_at IS NULL AND deletion_ref IS NULL)
) STRICT;

CREATE INDEX identity_persons_doc_idx ON identity_persons(doc_id);

CREATE TRIGGER identity_persons_no_delete BEFORE DELETE ON identity_persons
BEGIN SELECT RAISE(ABORT, 'S2 rows are not deleted by this build: the due-for-deletion list is built, the deleter is not'); END;

CREATE TRIGGER identity_persons_ref_and_document_fixed BEFORE UPDATE OF person_ref, doc_id, source_record_ref, recorded_by, recorded_at ON identity_persons
WHEN NEW.person_ref IS NOT OLD.person_ref OR NEW.doc_id IS NOT OLD.doc_id OR NEW.source_record_ref IS NOT OLD.source_record_ref
  OR NEW.recorded_by IS NOT OLD.recorded_by OR NEW.recorded_at IS NOT OLD.recorded_at
BEGIN SELECT RAISE(ABORT, 'a person_ref, the document it came from and its S1 record never change'); END;

-- THE NAME SEARCH LOG. S2-class data: it holds the term, so it lives beside S2 under
-- the same access and the same clock, and the audit line names the row, never the term.
CREATE TABLE identity_search_log (
  id            TEXT PRIMARY KEY,
  term          TEXT NOT NULL CHECK (length(trim(term)) BETWEEN 1 AND 200),
  result_count  INTEGER NOT NULL CHECK (result_count >= 0),
  searched_by   TEXT NOT NULL REFERENCES users(id),
  searched_at   TEXT NOT NULL
) STRICT;

CREATE TRIGGER identity_search_log_no_update BEFORE UPDATE ON identity_search_log
BEGIN SELECT RAISE(ABORT, 'identity_search_log is append-only'); END;

CREATE TRIGGER identity_search_log_no_delete BEFORE DELETE ON identity_search_log
BEGIN SELECT RAISE(ABORT, 'identity_search_log is append-only'); END;


-- ---------------------------------------------------------------------------
-- 7 · THE RIGHTS-REQUEST REGISTER (pack 2.3, 2.4; Retention Procedure 5.5.5)
--
-- TABLE A IS THE REQUEST. TABLE B IS ONE ROW PER LIMB, because the Article 12A(5)
-- pause applies to an Article 15 request and nothing else, and one letter can
-- carry two deadlines (pack 2.5.4, W4). The deadlines are READ from these inputs,
-- with the arithmetic shown, and never stored.
--
-- THE REGISTER RECORDS WHO ASKED (pack 2.8, point 4). It cannot answer the next
-- request from the same person otherwise; the safeguard is access, not anonymity.
-- ---------------------------------------------------------------------------
CREATE TABLE rights_requests (
  id                         TEXT PRIMARY KEY,
  request_ref                TEXT NOT NULL UNIQUE CHECK (request_ref GLOB 'RR-[0-9][0-9][0-9]*'),
  received_at                TEXT NOT NULL,
  received_via               TEXT NOT NULL CHECK (received_via IN ('DEDICATED_ADDRESS','FORM','POST','VERBAL','ELSEWHERE')),
  received_via_detail        TEXT,
  forwarded_at               TEXT,
  forwarded_by               TEXT,
  requester_as_described     TEXT,
  request_verbatim           TEXT NOT NULL CHECK (length(trim(request_verbatim)) BETWEEN 1 AND 20000),
  -- Who the register has matched the requester to, where anyone. Pointers, never copies.
  contact_id                 TEXT REFERENCES contacts(id),
  lead_id                    TEXT REFERENCES leads(id),
  person_ref                 TEXT REFERENCES identity_persons(person_ref),
  classification_alternatives TEXT,
  identity_status            TEXT CHECK (identity_status IN ('NOT_REQUIRED','REQUESTED','CONFIRMED','NOT_CONFIRMED')),
  identity_route             TEXT CHECK (identity_route IN ('A','B','NOT_REQUIRED')),
  identity_standard_applied  TEXT,
  identity_evidence          TEXT CHECK (identity_evidence IS NULL OR (json_valid(identity_evidence) AND json_type(identity_evidence) = 'array')),
  identity_outcome           TEXT CHECK (identity_outcome IN ('CONFIRMED','NARROWED','NOT_CONFIRMED','NOT_REQUIRED')),
  -- Route A only, and left empty on Route B rather than N/A: the field must not invite a value.
  authority_grantor          TEXT,
  id_requested_at            TEXT,
  id_received_at             TEXT,
  fee_status                 TEXT NOT NULL DEFAULT 'NOT_CHARGED' CHECK (fee_status IN ('NOT_CHARGED','CHARGED_12_5_A','REFUSED_12_5_B')),
  fee_charged_at             TEXT,
  fee_paid_at                TEXT,
  clarification              TEXT,
  search_scope               TEXT,
  search_done_on             TEXT CHECK (search_done_on IS NULL OR search_done_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  records_found              TEXT,
  restriction_applied_at     TEXT,
  responded_at               TEXT,
  response_route             TEXT,
  response_content_check     TEXT CHECK (response_content_check IS NULL OR (json_valid(response_content_check) AND json_type(response_content_check) = 'object')),
  outcome                    TEXT,
  status                     TEXT NOT NULL CHECK (status IN ('OPEN','AWAITING_REQUESTER','RESPONDED','CLOSED')),
  closed_at                  TEXT,
  closed_by                  TEXT REFERENCES users(id),
  recorded_by                TEXT NOT NULL REFERENCES users(id),
  created_at                 TEXT NOT NULL,
  updated_at                 TEXT NOT NULL,
  CHECK (identity_route = 'A' OR authority_grantor IS NULL),
  CHECK (id_received_at IS NULL OR id_requested_at IS NOT NULL),
  CHECK (fee_paid_at IS NULL OR fee_charged_at IS NOT NULL),
  CHECK (fee_charged_at IS NULL OR fee_status = 'CHARGED_12_5_A'),
  CHECK (status <> 'CLOSED' OR (closed_at IS NOT NULL AND closed_by IS NOT NULL AND responded_at IS NOT NULL
                                AND response_content_check IS NOT NULL AND search_scope IS NOT NULL)),
  CHECK (status = 'CLOSED' OR (closed_at IS NULL AND closed_by IS NULL))
) STRICT;

CREATE INDEX rights_requests_contact_idx ON rights_requests(contact_id);
CREATE INDEX rights_requests_person_idx ON rights_requests(person_ref);

CREATE TRIGGER rights_requests_received_at_fixed BEFORE UPDATE OF received_at, request_ref, request_verbatim ON rights_requests
WHEN NEW.received_at IS NOT OLD.received_at OR NEW.request_ref IS NOT OLD.request_ref OR NEW.request_verbatim IS NOT OLD.request_verbatim
BEGIN SELECT RAISE(ABORT, 'when a request was received, its reference and its words are fixed when it is logged'); END;

CREATE TRIGGER rights_requests_closed_is_final BEFORE UPDATE ON rights_requests
WHEN OLD.status = 'CLOSED'
BEGIN SELECT RAISE(ABORT, 'a closed request is kept as it was'); END;

CREATE TRIGGER rights_requests_no_delete BEFORE DELETE ON rights_requests
BEGIN SELECT RAISE(ABORT, 'the rights-request register is not deleted from: an Article 21 objection cannot remove an entry'); END;

CREATE TABLE rights_request_limbs (
  id                         TEXT PRIMARY KEY,
  request_id                 TEXT NOT NULL REFERENCES rights_requests(id),
  limb                       TEXT NOT NULL CHECK (limb IN ('ART_15','ART_16','ART_17','ART_18','ART_21','ART_22A_22D')),
  clarification_requested_at TEXT,
  clarification_received_at  TEXT,
  extension_notified_at      TEXT,
  extension_ground           TEXT CHECK (extension_ground IN ('COMPLEXITY','NUMBER')),
  -- As given to the data subject, verbatim (12A(4)(b)).
  extension_reasons          TEXT,
  decision                   TEXT CHECK (decision IN ('GRANTED','PARTLY_GRANTED','REFUSED')),
  decision_reasoning         TEXT,
  undue_delay_assessment     TEXT,
  created_at                 TEXT NOT NULL,
  updated_at                 TEXT NOT NULL,
  UNIQUE (request_id, limb),
  -- 12A(5): the pause is an Article 15 pause and nothing else.
  CHECK (limb = 'ART_15' OR (clarification_requested_at IS NULL AND clarification_received_at IS NULL)),
  CHECK (clarification_received_at IS NULL OR clarification_requested_at IS NOT NULL),
  CHECK (decision IS NULL OR (decision_reasoning IS NOT NULL AND length(trim(decision_reasoning)) > 0))
) STRICT;

CREATE TRIGGER rights_request_limbs_no_delete BEFORE DELETE ON rights_request_limbs
BEGIN SELECT RAISE(ABORT, 'a limb of a request is kept'); END;

CREATE TRIGGER rights_request_limbs_closed_request_is_final BEFORE UPDATE ON rights_request_limbs
WHEN EXISTS (SELECT 1 FROM rights_requests r WHERE r.id = OLD.request_id AND r.status = 'CLOSED')
BEGIN SELECT RAISE(ABORT, 'a closed request is kept as it was'); END;

CREATE TRIGGER rights_requests_close_needs_every_limb_decided BEFORE UPDATE OF status ON rights_requests
WHEN NEW.status = 'CLOSED' AND (
  NOT EXISTS (SELECT 1 FROM rights_request_limbs l WHERE l.request_id = NEW.id)
  OR EXISTS (SELECT 1 FROM rights_request_limbs l WHERE l.request_id = NEW.id
              AND (l.decision IS NULL OR l.undue_delay_assessment IS NULL OR length(trim(l.undue_delay_assessment)) = 0)))
BEGIN SELECT RAISE(ABORT, 'a request closes when every limb has a decision, its reasoning and an undue-delay assessment'); END;


-- ---------------------------------------------------------------------------
-- 8 · THE COMPLAINTS LOG (pack 3.4) — countable, as DPA 2018 s.164B needs
--
-- THE CLASSIFICATION IS MADE ON RECEIPT AND NEVER REVISED once made (pack 3.2):
-- a retrospective reclassification by a person who knows the outcome is not a
-- classification. The thirty-day acknowledgement deadline is READ.
-- ---------------------------------------------------------------------------
CREATE TABLE complaints (
  id                        TEXT PRIMARY KEY,
  complaint_ref             TEXT NOT NULL UNIQUE CHECK (complaint_ref GLOB 'CP-[0-9][0-9][0-9]*'),
  received_at               TEXT NOT NULL,
  received_via              TEXT NOT NULL CHECK (received_via IN ('FORM','DEDICATED_ADDRESS','POST','VERBAL','ELSEWHERE')),
  received_via_detail       TEXT,
  forwarded_at              TEXT,
  forwarded_by              TEXT,
  complainant_as_described  TEXT,
  complaint_verbatim        TEXT NOT NULL CHECK (length(trim(complaint_verbatim)) BETWEEN 1 AND 20000),
  business_id               TEXT REFERENCES businesses(id),
  claim_id                  TEXT,
  contact_id                TEXT REFERENCES contacts(id),
  person_ref                TEXT REFERENCES identity_persons(person_ref),
  is_164a                   TEXT CHECK (is_164a IN ('YES','NO','BOTH')),
  classification_reason     TEXT,
  classified_at             TEXT,
  classified_by             TEXT REFERENCES users(id),
  limb                      TEXT CHECK (limb IN ('UK_GDPR','PART_3')),
  alleged_infringement      TEXT,
  infringement_mapping      TEXT,
  acknowledged_at           TEXT,
  acknowledged_route        TEXT,
  enquiries_made            TEXT,
  outcome                   TEXT CHECK (outcome IN ('UPHELD','PARTLY_UPHELD','NOT_UPHELD','WITHDRAWN','OUT_OF_SCOPE_ROUTE_GIVEN')),
  out_of_scope_route        TEXT,
  outcome_reasoning         TEXT,
  outcome_notified_at       TEXT,
  undue_delay_assessment    TEXT,
  onward_route_given        TEXT CHECK (onward_route_given IS NULL OR (json_valid(onward_route_given) AND json_type(onward_route_given) = 'object')),
  decided_by                TEXT,
  decided_by_reason         TEXT,
  countersigned_by          TEXT,
  countersigner_view        TEXT,
  lessons_and_changes       TEXT,
  status                    TEXT NOT NULL CHECK (status IN ('OPEN','ACKNOWLEDGED','OUTCOME_NOTIFIED','CLOSED')),
  closed_at                 TEXT,
  closed_by                 TEXT REFERENCES users(id),
  recorded_by               TEXT NOT NULL REFERENCES users(id),
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL,
  FOREIGN KEY (claim_id, business_id) REFERENCES claims(id, business_id),
  CHECK (claim_id IS NULL OR business_id IS NOT NULL),
  CHECK ((is_164a IS NULL) = (classified_at IS NULL) AND (classified_at IS NULL) = (classified_by IS NULL)),
  CHECK (is_164a IS NULL OR (classification_reason IS NOT NULL AND length(trim(classification_reason)) > 0)),
  CHECK (outcome <> 'OUT_OF_SCOPE_ROUTE_GIVEN' OR (is_164a = 'NO' AND out_of_scope_route IS NOT NULL)),
  CHECK (status <> 'CLOSED' OR (closed_at IS NOT NULL AND closed_by IS NOT NULL AND is_164a IS NOT NULL
                                AND outcome IS NOT NULL AND outcome_reasoning IS NOT NULL AND outcome_notified_at IS NOT NULL
                                AND onward_route_given IS NOT NULL AND undue_delay_assessment IS NOT NULL
                                AND lessons_and_changes IS NOT NULL AND decided_by IS NOT NULL)),
  CHECK (status = 'CLOSED' OR (closed_at IS NULL AND closed_by IS NULL))
) STRICT;

CREATE INDEX complaints_received_idx ON complaints(received_at);
CREATE INDEX complaints_business_idx ON complaints(business_id);

CREATE TRIGGER complaints_received_fixed BEFORE UPDATE OF received_at, complaint_ref, complaint_verbatim ON complaints
WHEN NEW.received_at IS NOT OLD.received_at OR NEW.complaint_ref IS NOT OLD.complaint_ref OR NEW.complaint_verbatim IS NOT OLD.complaint_verbatim
BEGIN SELECT RAISE(ABORT, 'when a complaint was received, its reference and its words are fixed when it is logged'); END;

CREATE TRIGGER complaints_classification_never_revised BEFORE UPDATE OF is_164a, classification_reason, classified_at, classified_by ON complaints
WHEN OLD.is_164a IS NOT NULL AND (NEW.is_164a IS NOT OLD.is_164a OR NEW.classification_reason IS NOT OLD.classification_reason
  OR NEW.classified_at IS NOT OLD.classified_at OR NEW.classified_by IS NOT OLD.classified_by)
BEGIN SELECT RAISE(ABORT, 'a classification is made on receipt and is not revised once made'); END;

CREATE TRIGGER complaints_closed_is_final BEFORE UPDATE ON complaints
WHEN OLD.status = 'CLOSED'
BEGIN SELECT RAISE(ABORT, 'a closed complaint is kept as it was'); END;

CREATE TRIGGER complaints_no_delete BEFORE DELETE ON complaints
BEGIN SELECT RAISE(ABORT, 'the complaints log is not deleted from: an Article 21 objection cannot remove an entry'); END;

CREATE TABLE complaint_progress_updates (
  id            TEXT PRIMARY KEY,
  complaint_id  TEXT NOT NULL REFERENCES complaints(id),
  told_on       TEXT NOT NULL CHECK (told_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  said          TEXT NOT NULL CHECK (length(trim(said)) BETWEEN 2 AND 4000),
  recorded_by   TEXT NOT NULL REFERENCES users(id),
  recorded_at   TEXT NOT NULL
) STRICT;

CREATE TRIGGER complaint_progress_updates_no_update BEFORE UPDATE ON complaint_progress_updates
BEGIN SELECT RAISE(ABORT, 'complaint_progress_updates is append-only'); END;

CREATE TRIGGER complaint_progress_updates_no_delete BEFORE DELETE ON complaint_progress_updates
BEGIN SELECT RAISE(ABORT, 'complaint_progress_updates is append-only'); END;


-- ---------------------------------------------------------------------------
-- 9 · THE BREACH REGISTER (procedure 2.2, 2.3, 2.5, 3.4, 3.8; ADDENDA 2 and 3)
--
-- CATEGORIES AND COUNTS, NEVER NAMES. Where somebody had to be identified, the
-- entry carries an `annex_ref` into the restricted names annex, and nothing else.
--
-- TWO KINDS. A security incident, and — CRM 7 of 10's SOP 9 draft — ATTEMPTED
-- INVOICE FRAUD: a client told to pay somewhere else, recorded with the claim and
-- the date and NEVER THE BANK DETAILS. Whether that is a personal data breach is
-- the data protection officer's classification, left NULL until given.
--
-- AWARENESS IS FIXED ON THE DAY. A later correction is a row beside it, and the
-- original is never overwritten (procedure 3.1).
--
-- THE FOUR ARTICLE 34 FACTS are on the decision (procedure 5.3(2)): device
-- encrypted, backup restored, the recipient confirmed deletion, a route to the
-- individual exists. UNKNOWN AND NEVER RECORDED BOTH FAIL THE LIMB THEY FEED —
-- 34(3)(a) is refused without an encryption YES, 34(3)(b) without a confirmed
-- deletion YES (N4).
-- ---------------------------------------------------------------------------
CREATE TABLE breach_incidents (
  id                            TEXT PRIMARY KEY,
  incident_ref                  TEXT NOT NULL UNIQUE CHECK (incident_ref GLOB 'PDB-[0-9][0-9][0-9]*'),
  kind                          TEXT NOT NULL CHECK (kind IN ('SECURITY_INCIDENT','ATTEMPTED_INVOICE_FRAUD')),
  is_personal_data_breach       TEXT CHECK (is_personal_data_breach IN ('YES','NO')),
  classification_reason         TEXT,
  business_id                   TEXT REFERENCES businesses(id),
  claim_id                      TEXT,
  fraud_attempted_on            TEXT CHECK (fraud_attempted_on IS NULL OR fraud_attempted_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  discovered_at                 TEXT NOT NULL,
  discovered_by                 TEXT NOT NULL CHECK (length(trim(discovered_by)) BETWEEN 1 AND 200),
  discovery_route               TEXT NOT NULL CHECK (discovery_route IN ('PROCESSOR','CLIENT','DATA_SUBJECT','ALERT','ROUTINE_REVIEW','NOTICED')),
  awareness_at                  TEXT NOT NULL,
  awareness_basis               TEXT NOT NULL CHECK (length(trim(awareness_basis)) BETWEEN 2 AND 2000),
  occurred_state                TEXT NOT NULL CHECK (occurred_state IN ('KNOWN','ESTIMATED','UNKNOWN')),
  occurred_at                   TEXT,
  occurred_basis                TEXT,
  description                   TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 2 AND 4000),
  subject_categories_and_number TEXT,
  record_categories_and_number  TEXT,
  special_category_present      TEXT,
  likely_consequences           TEXT,
  remedial_action               TEXT,
  mitigating_action             TEXT,
  processor_involved            TEXT,
  annex_ref                     TEXT CHECK (annex_ref IS NULL OR annex_ref GLOB 'ANX-[0-9][0-9][0-9]*'),
  status                        TEXT NOT NULL CHECK (status IN ('OPEN','NOTIFICATION_DECIDED','CLOSED')),
  lessons_and_changes           TEXT,
  closed_at                     TEXT,
  closed_by                     TEXT REFERENCES users(id),
  recorded_by                   TEXT NOT NULL REFERENCES users(id),
  created_at                    TEXT NOT NULL,
  updated_at                    TEXT NOT NULL,
  FOREIGN KEY (claim_id, business_id) REFERENCES claims(id, business_id),
  CHECK (claim_id IS NULL OR business_id IS NOT NULL),
  CHECK (kind <> 'ATTEMPTED_INVOICE_FRAUD' OR (claim_id IS NOT NULL AND fraud_attempted_on IS NOT NULL)),
  CHECK (is_personal_data_breach IS NULL OR (classification_reason IS NOT NULL AND length(trim(classification_reason)) > 0)),
  CHECK (occurred_state <> 'KNOWN' OR occurred_at IS NOT NULL),
  CHECK (occurred_state = 'KNOWN' OR (occurred_basis IS NOT NULL AND length(trim(occurred_basis)) > 0)),
  CHECK (status <> 'CLOSED' OR (closed_at IS NOT NULL AND closed_by IS NOT NULL
                                AND lessons_and_changes IS NOT NULL AND length(trim(lessons_and_changes)) > 0)),
  CHECK (status = 'CLOSED' OR (closed_at IS NULL AND closed_by IS NULL))
) STRICT;

CREATE INDEX breach_incidents_claim_idx ON breach_incidents(claim_id);

CREATE TRIGGER breach_incidents_awareness_fixed BEFORE UPDATE OF awareness_at, awareness_basis, discovered_at, incident_ref, kind ON breach_incidents
WHEN NEW.awareness_at IS NOT OLD.awareness_at OR NEW.awareness_basis IS NOT OLD.awareness_basis
  OR NEW.discovered_at IS NOT OLD.discovered_at OR NEW.incident_ref IS NOT OLD.incident_ref OR NEW.kind IS NOT OLD.kind
BEGIN SELECT RAISE(ABORT, 'awareness is fixed on the day: record a correction beside it, never over it'); END;

CREATE TRIGGER breach_incidents_closed_is_final BEFORE UPDATE ON breach_incidents
WHEN OLD.status = 'CLOSED'
BEGIN SELECT RAISE(ABORT, 'a closed breach entry is kept as it was'); END;

CREATE TRIGGER breach_incidents_no_delete BEFORE DELETE ON breach_incidents
BEGIN SELECT RAISE(ABORT, 'the breach register is not deleted from'); END;

-- NEVER BANK DETAILS. The words here; the shapes — a sort code, an account number, an IBAN — are refused in code as well.
CREATE TRIGGER breach_incidents_no_bank_details_insert BEFORE INSERT ON breach_incidents
WHEN (COALESCE(NEW.description,'') || ' ' || COALESCE(NEW.remedial_action,'') || ' ' || COALESCE(NEW.mitigating_action,'') || ' ' || COALESCE(NEW.likely_consequences,'')) LIKE '%sort code%'
  OR (COALESCE(NEW.description,'') || ' ' || COALESCE(NEW.remedial_action,'') || ' ' || COALESCE(NEW.mitigating_action,'') || ' ' || COALESCE(NEW.likely_consequences,'')) LIKE '%account number%'
  OR (COALESCE(NEW.description,'') || ' ' || COALESCE(NEW.remedial_action,'') || ' ' || COALESCE(NEW.mitigating_action,'') || ' ' || COALESCE(NEW.likely_consequences,'')) LIKE '%iban%'
BEGIN SELECT RAISE(ABORT, 'E_NO_BANK_DETAILS: the breach register never records bank details'); END;

CREATE TRIGGER breach_incidents_no_bank_details_update BEFORE UPDATE OF description, remedial_action, mitigating_action, likely_consequences ON breach_incidents
WHEN (COALESCE(NEW.description,'') || ' ' || COALESCE(NEW.remedial_action,'') || ' ' || COALESCE(NEW.mitigating_action,'') || ' ' || COALESCE(NEW.likely_consequences,'')) LIKE '%sort code%'
  OR (COALESCE(NEW.description,'') || ' ' || COALESCE(NEW.remedial_action,'') || ' ' || COALESCE(NEW.mitigating_action,'') || ' ' || COALESCE(NEW.likely_consequences,'')) LIKE '%account number%'
  OR (COALESCE(NEW.description,'') || ' ' || COALESCE(NEW.remedial_action,'') || ' ' || COALESCE(NEW.mitigating_action,'') || ' ' || COALESCE(NEW.likely_consequences,'')) LIKE '%iban%'
BEGIN SELECT RAISE(ABORT, 'E_NO_BANK_DETAILS: the breach register never records bank details'); END;

CREATE TABLE breach_awareness_corrections (
  id              TEXT PRIMARY KEY,
  incident_id     TEXT NOT NULL REFERENCES breach_incidents(id),
  corrected_to    TEXT NOT NULL,
  reason          TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 2 AND 2000),
  recorded_by     TEXT NOT NULL REFERENCES users(id),
  recorded_at     TEXT NOT NULL
) STRICT;

CREATE TRIGGER breach_awareness_corrections_no_update BEFORE UPDATE ON breach_awareness_corrections
BEGIN SELECT RAISE(ABORT, 'breach_awareness_corrections is append-only'); END;

CREATE TRIGGER breach_awareness_corrections_no_delete BEFORE DELETE ON breach_awareness_corrections
BEGIN SELECT RAISE(ABORT, 'breach_awareness_corrections is append-only'); END;

CREATE TABLE breach_decisions (
  id                                 TEXT PRIMARY KEY,
  incident_id                        TEXT NOT NULL UNIQUE REFERENCES breach_incidents(id),
  art33_decision                     TEXT CHECK (art33_decision IN ('NOTIFIED','NOT_NOTIFIED','NOTIFIED_IN_PHASES')),
  art33_reasoning                    TEXT,
  notified_at                        TEXT,
  notified_recipient                 TEXT,
  delay_reasons                      TEXT,
  art34_decision                     TEXT CHECK (art34_decision IN
                                       ('COMMUNICATED','NOT_COMMUNICATED_NOT_HIGH_RISK','NOT_COMMUNICATED_34_3_A',
                                        'NOT_COMMUNICATED_34_3_B','PUBLIC_COMMUNICATION_34_3_C')),
  art34_reasoning                    TEXT,
  communicated_at                    TEXT,
  communicated_route                 TEXT,
  fact_device_encrypted              TEXT CHECK (fact_device_encrypted IN ('YES','NO','UNKNOWN')),
  fact_backup_restored               TEXT CHECK (fact_backup_restored IN ('YES','NO','UNKNOWN')),
  fact_recipient_confirmed_deletion  TEXT CHECK (fact_recipient_confirmed_deletion IN ('YES','NO','UNKNOWN')),
  fact_route_to_individual           TEXT CHECK (fact_route_to_individual IN ('YES','NO','UNKNOWN')),
  decided_by                         TEXT,
  decided_at                         TEXT,
  deputy_route_used                  INTEGER NOT NULL DEFAULT 0 CHECK (deputy_route_used IN (0,1)),
  dpo_contact_attempts               TEXT,
  countersigned_by                   TEXT,
  recorded_by                        TEXT NOT NULL REFERENCES users(id),
  created_at                         TEXT NOT NULL,
  updated_at                         TEXT NOT NULL,
  CHECK (art33_decision IS NULL OR (art33_reasoning IS NOT NULL AND length(trim(art33_reasoning)) > 0
                                    AND decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CHECK (art34_decision IS NULL OR (art34_reasoning IS NOT NULL AND length(trim(art34_reasoning)) > 0)),
  CHECK (art33_decision IS NOT 'NOTIFIED' OR (notified_at IS NOT NULL AND notified_recipient IS NOT NULL)),
  CHECK (art34_decision IS NOT 'NOT_COMMUNICATED_34_3_A' OR fact_device_encrypted IS 'YES'),
  CHECK (art34_decision IS NOT 'NOT_COMMUNICATED_34_3_B' OR fact_recipient_confirmed_deletion IS 'YES'),
  CHECK (deputy_route_used = 0 OR (dpo_contact_attempts IS NOT NULL AND length(trim(dpo_contact_attempts)) > 0))
) STRICT;

CREATE TRIGGER breach_decisions_no_delete BEFORE DELETE ON breach_decisions
BEGIN SELECT RAISE(ABORT, 'a breach decision is kept'); END;

CREATE TRIGGER breach_decisions_closed_incident_is_final BEFORE UPDATE ON breach_decisions
WHEN EXISTS (SELECT 1 FROM breach_incidents i WHERE i.id = OLD.incident_id AND i.status = 'CLOSED')
BEGIN SELECT RAISE(ABORT, 'a closed breach entry is kept as it was'); END;

CREATE TABLE breach_notification_phases (
  id            TEXT PRIMARY KEY,
  incident_id   TEXT NOT NULL REFERENCES breach_incidents(id),
  phase_no      INTEGER NOT NULL CHECK (phase_no >= 1),
  sent_at       TEXT NOT NULL,
  what_was_sent TEXT NOT NULL CHECK (length(trim(what_was_sent)) BETWEEN 2 AND 4000),
  outstanding   TEXT NOT NULL CHECK (length(trim(outstanding)) BETWEEN 2 AND 4000),
  recorded_by   TEXT NOT NULL REFERENCES users(id),
  recorded_at   TEXT NOT NULL,
  UNIQUE (incident_id, phase_no)
) STRICT;

CREATE TRIGGER breach_notification_phases_no_update BEFORE UPDATE ON breach_notification_phases
BEGIN SELECT RAISE(ABORT, 'breach_notification_phases is append-only'); END;

CREATE TRIGGER breach_notification_phases_no_delete BEFORE DELETE ON breach_notification_phases
BEGIN SELECT RAISE(ABORT, 'breach_notification_phases is append-only'); END;

-- WHO ELSE WAS TOLD — the ICO answer sheet's section 4.6 checklist, one row per recipient.
CREATE TABLE breach_other_notifications (
  id              TEXT PRIMARY KEY,
  incident_id     TEXT NOT NULL REFERENCES breach_incidents(id),
  recipient_kind  TEXT NOT NULL CHECK (recipient_kind IN
                    ('INDIVIDUALS','ART19_RECIPIENTS','INSURER','NCSC','ACTION_FRAUD_OR_POLICE','PROCESSOR','CLIENT')),
  position        TEXT NOT NULL CHECK (position IN ('TOLD','NOT_TOLD','NOT_APPLICABLE','NO_POLICY_IN_FORCE')),
  told_at         TEXT,
  note            TEXT,
  recorded_by     TEXT NOT NULL REFERENCES users(id),
  recorded_at     TEXT NOT NULL,
  UNIQUE (incident_id, recipient_kind),
  CHECK (position <> 'NO_POLICY_IN_FORCE' OR recipient_kind = 'INSURER'),
  CHECK ((position = 'TOLD') = (told_at IS NOT NULL))
) STRICT;

CREATE TRIGGER breach_other_notifications_no_delete BEFORE DELETE ON breach_other_notifications
BEGIN SELECT RAISE(ABORT, 'breach_other_notifications is kept'); END;

-- AN INSURER IS TOLD ONLY WHERE A POLICY IS RECORDED AS IN FORCE — never on silence (N4).
CREATE TRIGGER breach_other_notifications_insurer_needs_a_policy_insert BEFORE INSERT ON breach_other_notifications
WHEN NEW.recipient_kind = 'INSURER' AND NEW.position <> 'NO_POLICY_IN_FORCE' AND COALESCE((
  SELECT s.value FROM compliance_settings s WHERE s.setting = 'INSURANCE_POSITION'
   ORDER BY s.effective_from DESC, s.rowid DESC LIMIT 1), 'UNKNOWN') <> 'POLICY_IN_FORCE'
BEGIN SELECT RAISE(ABORT, 'no insurance policy is recorded as in force: the insurer row records NO_POLICY_IN_FORCE'); END;

CREATE TRIGGER breach_other_notifications_insurer_needs_a_policy_update BEFORE UPDATE OF position ON breach_other_notifications
WHEN NEW.recipient_kind = 'INSURER' AND NEW.position <> 'NO_POLICY_IN_FORCE' AND COALESCE((
  SELECT s.value FROM compliance_settings s WHERE s.setting = 'INSURANCE_POSITION'
   ORDER BY s.effective_from DESC, s.rowid DESC LIMIT 1), 'UNKNOWN') <> 'POLICY_IN_FORCE'
BEGIN SELECT RAISE(ABORT, 'no insurance policy is recorded as in force: the insurer row records NO_POLICY_IN_FORCE'); END;


-- ---------------------------------------------------------------------------
-- 10 · HOLDS, RESTRICTIONS AND CROSS-REFERENCES
--
-- A LEGAL HOLD BLOCKS A RECORD FROM THE DUE-FOR-DELETION LIST; A RESTRICTION IS
-- THE ARTICLE 18 MARKER (Retention Procedure 1.3). EACH CARRIES ITS REASON AND
-- THE DATE IT IS NEXT REVIEWED, because a hold with no reason is treated as
-- expired at the next review (3.3).
--
-- A CROSS-REFERENCE IS ONE ROW, READ IN BOTH DIRECTIONS — never a merged record (pack 6.5).
-- ---------------------------------------------------------------------------
CREATE TABLE legal_holds (
  id                 TEXT PRIMARY KEY,
  hold_kind          TEXT NOT NULL CHECK (hold_kind IN ('LEGAL_HOLD','RESTRICTION')),
  record_kind        TEXT NOT NULL CHECK (length(record_kind) BETWEEN 2 AND 60 AND record_kind NOT GLOB '*[^A-Z0-9_]*'),
  record_id          TEXT NOT NULL CHECK (length(trim(record_id)) BETWEEN 1 AND 100),
  reason_kind        TEXT NOT NULL CHECK (reason_kind IN ('RIGHTS_REQUEST','COMPLAINT','BREACH','HMRC_ENQUIRY','DISPUTE')),
  rights_request_id  TEXT REFERENCES rights_requests(id),
  complaint_id       TEXT REFERENCES complaints(id),
  incident_id        TEXT REFERENCES breach_incidents(id),
  reason             TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 2 AND 2000),
  review_on          TEXT NOT NULL CHECK (review_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  set_by             TEXT NOT NULL REFERENCES users(id),
  set_at             TEXT NOT NULL,
  lifted_at          TEXT,
  lifted_by          TEXT REFERENCES users(id),
  lift_reason        TEXT,
  CHECK (reason_kind <> 'RIGHTS_REQUEST' OR rights_request_id IS NOT NULL),
  CHECK (reason_kind <> 'COMPLAINT' OR complaint_id IS NOT NULL),
  CHECK (reason_kind <> 'BREACH' OR incident_id IS NOT NULL),
  CHECK ((lifted_at IS NULL) = (lifted_by IS NULL) AND (lifted_by IS NULL) = (lift_reason IS NULL))
) STRICT;

CREATE INDEX legal_holds_record_idx ON legal_holds(record_kind, record_id);

CREATE TRIGGER legal_holds_only_lifts BEFORE UPDATE ON legal_holds
WHEN OLD.lifted_at IS NOT NULL
  OR NEW.id IS NOT OLD.id OR NEW.hold_kind IS NOT OLD.hold_kind OR NEW.record_kind IS NOT OLD.record_kind
  OR NEW.record_id IS NOT OLD.record_id OR NEW.reason_kind IS NOT OLD.reason_kind OR NEW.reason IS NOT OLD.reason
  OR NEW.rights_request_id IS NOT OLD.rights_request_id OR NEW.complaint_id IS NOT OLD.complaint_id
  OR NEW.incident_id IS NOT OLD.incident_id OR NEW.set_by IS NOT OLD.set_by OR NEW.set_at IS NOT OLD.set_at
BEGIN SELECT RAISE(ABORT, 'a hold is set once, may have its review date moved, and is lifted once with a reason'); END;

CREATE TRIGGER legal_holds_no_delete BEFORE DELETE ON legal_holds
BEGIN SELECT RAISE(ABORT, 'a hold is lifted, never deleted'); END;

CREATE TABLE compliance_links (
  id         TEXT PRIMARY KEY,
  from_kind  TEXT NOT NULL CHECK (from_kind IN ('RIGHTS_REQUEST','COMPLAINT','BREACH')),
  from_id    TEXT NOT NULL,
  to_kind    TEXT NOT NULL CHECK (to_kind IN ('RIGHTS_REQUEST','COMPLAINT','BREACH')),
  to_id      TEXT NOT NULL,
  linked_by  TEXT NOT NULL REFERENCES users(id),
  linked_at  TEXT NOT NULL,
  UNIQUE (from_kind, from_id, to_kind, to_id),
  CHECK (NOT (from_kind = to_kind AND from_id = to_id))
) STRICT;

CREATE TRIGGER compliance_links_no_update BEFORE UPDATE ON compliance_links
BEGIN SELECT RAISE(ABORT, 'compliance_links is append-only'); END;

CREATE TRIGGER compliance_links_no_delete BEFORE DELETE ON compliance_links
BEGIN SELECT RAISE(ABORT, 'compliance_links is append-only'); END;


-- ---------------------------------------------------------------------------
-- 11 · ONE CONSENT HISTORY PER CONTACT
--
-- A contact's answer on being contacted and on marketing, each change a row with
-- the words asked, the time and the route — and the contact's capture flags stay
-- the answer until the first row. SHARING PROGRESS WITH A REFERRING FIRM IS NOT
-- COPIED HERE: the history reads introducer_share_consents where it is.
-- ---------------------------------------------------------------------------
CREATE TABLE consent_answers (
  id               TEXT PRIMARY KEY,
  contact_id       TEXT NOT NULL REFERENCES contacts(id),
  kind             TEXT NOT NULL CHECK (kind IN ('CONTACT','MARKETING')),
  decision         TEXT NOT NULL CHECK (decision IN ('GIVEN','DECLINED','WITHDRAWN')),
  wording_version  TEXT NOT NULL CHECK (length(trim(wording_version)) BETWEEN 1 AND 60),
  route            TEXT NOT NULL CHECK (route IN ('STAFF_RECORDED','CLIENT_PORTAL')),
  recorded_by      TEXT NOT NULL REFERENCES users(id),
  recorded_at      TEXT NOT NULL
) STRICT;

CREATE INDEX consent_answers_contact_idx ON consent_answers(contact_id, kind);

CREATE TRIGGER consent_answers_no_update BEFORE UPDATE ON consent_answers
BEGIN SELECT RAISE(ABORT, 'consent_answers is append-only: record a new answer instead'); END;

CREATE TRIGGER consent_answers_no_delete BEFORE DELETE ON consent_answers
BEGIN SELECT RAISE(ABORT, 'consent_answers is append-only: record a new answer instead'); END;


-- ---------------------------------------------------------------------------
-- 12 · introducer_share_consents, REBUILT — THE ROUTE CLIENT_PORTAL
--
-- The client gives or withdraws the opt-in in their own portal, writing THIS
-- table under a route of its own. A CLIENT_PORTAL row is recorded by a login of
-- that same organisation and no other. Every other column, CHECK, index and
-- trigger is character for character 014's.
-- ---------------------------------------------------------------------------
DROP TRIGGER introducer_notices_queued_only_under_the_opt_in;

CREATE TABLE introducer_share_consents_new (
  id               TEXT PRIMARY KEY,
  introducer_id    TEXT NOT NULL REFERENCES introducers(id),
  business_id      TEXT REFERENCES businesses(id),
  lead_id          TEXT REFERENCES leads(id),
  decision         TEXT NOT NULL CHECK (decision IN ('GIVEN','DECLINED','WITHDRAWN')),
  wording_version  TEXT NOT NULL CHECK (wording_version IN ('SHARE-PROGRESS-1')),
  route            TEXT NOT NULL CHECK (route IN ('STAFF_RECORDED','CLIENT_PORTAL')),
  recorded_by      TEXT NOT NULL REFERENCES users(id),
  recorded_at      TEXT NOT NULL,
  CHECK ((business_id IS NULL) <> (lead_id IS NULL)),
  CHECK (route <> 'CLIENT_PORTAL' OR business_id IS NOT NULL)
) STRICT;

INSERT INTO introducer_share_consents_new (id, introducer_id, business_id, lead_id, decision, wording_version, route, recorded_by, recorded_at)
SELECT id, introducer_id, business_id, lead_id, decision, wording_version, route, recorded_by, recorded_at
FROM introducer_share_consents ORDER BY rowid;

DROP TABLE introducer_share_consents;
ALTER TABLE introducer_share_consents_new RENAME TO introducer_share_consents;

CREATE INDEX introducer_share_consents_business_idx ON introducer_share_consents(business_id, introducer_id);
CREATE INDEX introducer_share_consents_lead_idx ON introducer_share_consents(lead_id, introducer_id);

CREATE TRIGGER introducer_share_consents_no_update BEFORE UPDATE ON introducer_share_consents
BEGIN SELECT RAISE(ABORT, 'introducer_share_consents is append-only: record a new answer instead'); END;

CREATE TRIGGER introducer_share_consents_no_delete BEFORE DELETE ON introducer_share_consents
BEGIN SELECT RAISE(ABORT, 'introducer_share_consents is append-only: record a new answer instead'); END;

CREATE TRIGGER introducer_share_consents_referred_by_that_firm BEFORE INSERT ON introducer_share_consents
WHEN (NEW.lead_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = NEW.lead_id AND l.introducer_id = NEW.introducer_id))
  OR (NEW.business_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.business_id = NEW.business_id AND l.introducer_id = NEW.introducer_id))
BEGIN SELECT RAISE(ABORT, 'a client opts in to sharing progress with a firm that referred them, and no other'); END;

CREATE TRIGGER introducer_share_consents_client_portal_is_the_clients_own BEFORE INSERT ON introducer_share_consents
WHEN NEW.route = 'CLIENT_PORTAL' AND NOT EXISTS (
  SELECT 1 FROM users u WHERE u.id = NEW.recorded_by AND u.role = 'CLIENT' AND u.business_id = NEW.business_id AND u.disabled_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'a portal answer is recorded by a login of that same organisation, and no one else'); END;

-- verbatim from 014
CREATE TRIGGER introducer_notices_queued_only_under_the_opt_in BEFORE INSERT ON introducer_notices
WHEN NEW.outcome = 'QUEUED' AND NOT EXISTS (
  SELECT 1 FROM introducer_share_consents s
   WHERE s.id = NEW.consent_id
     AND s.introducer_id = NEW.introducer_id
     AND s.decision = 'GIVEN'
     AND (s.lead_id = NEW.lead_id
          OR s.business_id = (SELECT l.business_id FROM leads l WHERE l.id = NEW.lead_id)
          OR s.lead_id IN (SELECT l2.id FROM leads l2
                            WHERE l2.business_id = (SELECT l.business_id FROM leads l WHERE l.id = NEW.lead_id)))
     AND NOT EXISTS (
       SELECT 1 FROM introducer_share_consents t
        WHERE t.introducer_id = s.introducer_id AND t.rowid > s.rowid
          AND (t.lead_id = NEW.lead_id
               OR t.business_id = (SELECT l.business_id FROM leads l WHERE l.id = NEW.lead_id)
               OR t.lead_id IN (SELECT l2.id FROM leads l2
                                 WHERE l2.business_id = (SELECT l.business_id FROM leads l WHERE l.id = NEW.lead_id)))))
BEGIN SELECT RAISE(ABORT, 'E_NO_OPT_IN: a notice reaches the firm only while the client''s opt-in to share progress with it is given'); END;


-- ---------------------------------------------------------------------------
-- 13 · email_templates' named trigger pair, REPLACED BY NAME — no tipping off
--
-- 016's words, character for character, and the words that would tell a client
-- or an accountant that anybody suspects anything. src/web/templates.ts's
-- `templateRefusal` refuses the same words, and again at the merge.
-- ---------------------------------------------------------------------------
DROP TRIGGER email_templates_no_invoice_or_bank_insert;
DROP TRIGGER email_templates_no_invoice_or_bank_update;

CREATE TRIGGER email_templates_no_invoice_or_bank_insert BEFORE INSERT ON email_templates
WHEN (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%invoice%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%remit%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%sort code%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%account number%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%bank detail%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%bank account%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%iban%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%payment detail%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%bank transfer%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%pay to%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%pay into%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%amount due%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%amount outstanding%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%fee note%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%statement of account%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%money laundering%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%suspicio%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%national crime agency%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%nominated officer%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%due diligence%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%tipping off%'
BEGIN SELECT RAISE(ABORT, 'E_TEMPLATE_REFUSED: a template may not carry bank details, an invoice or anything that would tip somebody off'); END;

CREATE TRIGGER email_templates_no_invoice_or_bank_update BEFORE UPDATE OF label, subject, body ON email_templates
WHEN (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%invoice%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%remit%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%sort code%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%account number%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%bank detail%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%bank account%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%iban%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%payment detail%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%bank transfer%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%pay to%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%pay into%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%amount due%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%amount outstanding%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%fee note%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%statement of account%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%money laundering%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%suspicio%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%national crime agency%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%nominated officer%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%due diligence%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%tipping off%'
BEGIN SELECT RAISE(ABORT, 'E_TEMPLATE_REFUSED: a template may not carry bank details, an invoice or anything that would tip somebody off'); END;


-- 14 · THE GUARD. Zero violations, or this migration does not happen at all.
CREATE TABLE _fk_check_guard (ok INTEGER NOT NULL CHECK (ok = 0)) STRICT;
INSERT INTO _fk_check_guard (ok) SELECT count(*) FROM pragma_foreign_key_check;
DROP TABLE _fk_check_guard;

-- 15 · commit.
COMMIT;

-- 16 · and back on.
PRAGMA foreign_keys = ON;
