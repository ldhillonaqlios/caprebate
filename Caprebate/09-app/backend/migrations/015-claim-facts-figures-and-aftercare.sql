-- ===========================================================================
-- 015 — THE CLAIM'S CAPITAL ALLOWANCES FACTS, THE FOUR FIGURES, THE TAX
-- ADVISER'S SIGN-OFF, THE DELIVERABLES REGISTER AND AFTERCARE.
--                                                     CRM 6 of 10, 11 Sep 2026
--
-- The scope is 09-app/CAPREBATE-CRM-DISPOSITION.md, Part B2, and every choice
-- below that is not obvious is recorded in its Part E, rows E59 onwards. The
-- code is src/web/claim-facts.ts and src/web/claim-record.ts.
--
-- EXTENDED, NEVER REBUILT. Six tables are created and one column is added to
-- `properties`. `claims.tax_adviser_signoff_at` is RETIRED, not dropped: the
-- gate reads the sign-off record now, and two named triggers refuse any write
-- to the column, so nothing can stand in for the record by setting a date.
--
-- WHAT IS NOT IN THIS FILE, ON PURPOSE
--   A FIGURES TABLE. The indicative estimate is sealed in `estimates` with its
--     hash (002); the surveyor's committed figure is sealed in
--     `surveyor_commitments` with its hash (006); the tax adviser's figure is
--     sealed in its sign-off record below. A fourth copy of each would be a
--     second place for a sealed figure to disagree with itself. The researched
--     estimate has NO column anywhere: it is not permitted while the two
--     register gates are shut, and a column would be an invitation to fill it.
--   A PERSON'S NAME. No column here names a person. A funder is a payer
--     CLASS; a previous owner is a company name or a role token, guarded in
--     code; the tax adviser is recorded by firm or role and credential — whether
--     their own name may be kept is a question for the data protection officer.
--   A REPORT. Nothing here generates one (Developer Spec W10). A deliverable is
--     TRACKED: its state, its version, its issue date and its document type.
--
-- N4 REACHES EVERY COLUMN. A fact nobody recorded is no row; a fact recorded as
-- not known is a row whose answer is UNKNOWN; the code reads the two
-- identically and neither passes a gate. No amount may be zero: a price, a
-- grant or a figure of nothing is left blank, never written as 0.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1 · CAPTURED FACTS — only where nothing already derives them
--
-- APPEND-ONLY, THE LATEST ROW PER KEY BEING THE ANSWER, as `enquiry_checks`
-- (010) is. Every row carries its SOURCE — one of the source register's own
-- ids (04-phase-work/phase3/caprebate-source-register.ts) that a person can
-- speak for: the client's answer, the client's document, the surveyor, or the
-- tax adviser. A derived fact never has a row here: the store refuses one.
--
-- THE KEY LIST IS A NAMED TRIGGER, NOT A CHECK (disposition row E2), so a later
-- phase adds a key by replacing one trigger and rebuilds nothing.
-- ---------------------------------------------------------------------------
CREATE TABLE claim_facts (
  id           TEXT PRIMARY KEY,
  claim_id     TEXT NOT NULL REFERENCES claims(id),
  fact_key     TEXT NOT NULL,
  answer       TEXT NOT NULL CHECK (answer IN ('VALUE','UNKNOWN')),
  value_text   TEXT CHECK (value_text IS NULL OR length(trim(value_text)) BETWEEN 1 AND 4000),
  value_pence  INTEGER CHECK (value_pence IS NULL OR value_pence > 0),
  value_date   TEXT CHECK (value_date IS NULL OR value_date GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  source_id    TEXT NOT NULL CHECK (source_id IN ('CLIENT_ANSWER','CLIENT_DOC','SURVEYOR','CTA')),
  note         TEXT,
  recorded_by  TEXT NOT NULL REFERENCES users(id),
  recorded_at  TEXT NOT NULL,
  -- UNKNOWN carries no value; a VALUE carries exactly one.
  CHECK ((answer = 'UNKNOWN') = (value_text IS NULL AND value_pence IS NULL AND value_date IS NULL)),
  CHECK ((value_text IS NOT NULL) + (value_pence IS NOT NULL) + (value_date IS NOT NULL) <= 1)
) STRICT;

CREATE INDEX claim_facts_claim_idx ON claim_facts(claim_id, fact_key, recorded_at);

CREATE TRIGGER claim_facts_key_insert BEFORE INSERT ON claim_facts
WHEN NEW.fact_key NOT IN (
  'ACCOUNTING_PERIOD_START','ACCOUNTING_PERIOD_END','SUFFICIENT_PROFIT','AIA_HEADROOM','AIA_HEADROOM_AMOUNT',
  'POOL_SPLIT_MAIN','POOL_SPLIT_SPECIAL','SBA_QUALIFYING_EXPENDITURE',
  'ELECTION_EXISTS','ELECTION_SECTION','ELECTION_NOTIFIED_ON','ELECTION_VALUE','ELECTION_ELEMENTS',
  'ELECTION_TRIBUNAL_APPLIED_ON','ELECTION_TRIBUNAL_STATUS',
  'GRANTS_EXIST','ACQUISITION_COSTS','TRANSACTION_TAX','BUYER_ALTERATIONS','BUYER_ALTERATIONS_AMOUNT',
  'SCOTTISH_TAXPAYER')
BEGIN SELECT RAISE(ABORT, 'claim_facts.fact_key is not a fact the claim captures'); END;

CREATE TRIGGER claim_facts_no_update BEFORE UPDATE ON claim_facts
BEGIN SELECT RAISE(ABORT, 'claim_facts is append-only: record a new answer instead'); END;

CREATE TRIGGER claim_facts_no_delete BEFORE DELETE ON claim_facts
BEGIN SELECT RAISE(ABORT, 'claim_facts is append-only: record a new answer instead'); END;


-- ---------------------------------------------------------------------------
-- 2 · GRANTS AND CONTRIBUTIONS, TRACED TO COST ELEMENTS (Rulebook F)
--
-- The payer is a CLASS from Rulebook F's own list, never a name. A grant is
-- traced YES only with the cost elements written against it (F3: "trace it to
-- cost elements; do not pro-rate"). A row is ended by withdrawing it, with who,
-- when and why — never edited and never deleted.
-- ---------------------------------------------------------------------------
CREATE TABLE claim_grants (
  id               TEXT PRIMARY KEY,
  claim_id         TEXT NOT NULL REFERENCES claims(id),
  kind             TEXT NOT NULL CHECK (kind IN ('GRANT','CONTRIBUTION')),
  payer_class      TEXT NOT NULL CHECK (payer_class IN
                     ('nhs','local_authority','homes_england_gla','other_public','landlord_unconnected',
                      'landlord_connected','group_company','charity','individual','insurer','UNKNOWN')),
  amount_pence     INTEGER CHECK (amount_pence IS NULL OR amount_pence > 0),
  amount_basis     TEXT NOT NULL CHECK (amount_basis IN ('agreement','client_estimate','inferred','UNKNOWN')),
  traced           TEXT NOT NULL CHECK (traced IN ('YES','NO','UNKNOWN')),
  traced_elements  TEXT CHECK (traced_elements IS NULL OR length(trim(traced_elements)) BETWEEN 1 AND 4000),
  source_id        TEXT NOT NULL CHECK (source_id IN ('CLIENT_ANSWER','CLIENT_DOC','SURVEYOR','CTA')),
  note             TEXT,
  recorded_by      TEXT NOT NULL REFERENCES users(id),
  recorded_at      TEXT NOT NULL,
  withdrawn_by     TEXT REFERENCES users(id),
  withdrawn_at     TEXT,
  withdraw_reason  TEXT,
  CHECK (traced <> 'YES' OR traced_elements IS NOT NULL),
  CHECK ((withdrawn_at IS NULL) = (withdrawn_by IS NULL)),
  CHECK ((withdrawn_at IS NULL) = (withdraw_reason IS NULL))
) STRICT;

CREATE INDEX claim_grants_claim_idx ON claim_grants(claim_id);

CREATE TRIGGER claim_grants_no_delete BEFORE DELETE ON claim_grants
BEGIN SELECT RAISE(ABORT, 'a grant is withdrawn with a reason, never deleted'); END;

CREATE TRIGGER claim_grants_only_withdrawn BEFORE UPDATE ON claim_grants
WHEN OLD.withdrawn_at IS NOT NULL
  OR NEW.id IS NOT OLD.id OR NEW.claim_id IS NOT OLD.claim_id OR NEW.kind IS NOT OLD.kind
  OR NEW.payer_class IS NOT OLD.payer_class OR NEW.amount_pence IS NOT OLD.amount_pence
  OR NEW.amount_basis IS NOT OLD.amount_basis OR NEW.traced IS NOT OLD.traced
  OR NEW.traced_elements IS NOT OLD.traced_elements OR NEW.source_id IS NOT OLD.source_id
  OR NEW.note IS NOT OLD.note OR NEW.recorded_by IS NOT OLD.recorded_by OR NEW.recorded_at IS NOT OLD.recorded_at
BEGIN SELECT RAISE(ABORT, 'a grant is withdrawn once, with who, when and why; nothing else about it changes — record a new one'); END;


-- ---------------------------------------------------------------------------
-- 3 · THE PRIOR OWNER CHAIN (Rulebooks A-Addendum and B)
--
-- `owner` IS A COMPANY NAME OR A ROLE TOKEN, NEVER A PERSON'S NAME (N2). The
-- guard is `isCompanyOrRoleToken` in src/web/crm.ts, the same one a property's
-- previous owner already passes. Positions count back from our client: 1 is the
-- seller, 2 the owner before them.
-- ---------------------------------------------------------------------------
CREATE TABLE claim_owner_chain (
  id            TEXT PRIMARY KEY,
  claim_id      TEXT NOT NULL REFERENCES claims(id),
  position      INTEGER NOT NULL CHECK (position BETWEEN 1 AND 20),
  owner         TEXT NOT NULL CHECK (length(trim(owner)) BETWEEN 2 AND 300),
  acquired_on   TEXT CHECK (acquired_on IS NULL OR acquired_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  ceased_on     TEXT CHECK (ceased_on IS NULL OR ceased_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  claimed       TEXT NOT NULL CHECK (claimed IN ('YES','NO','UNKNOWN')),
  source_id     TEXT NOT NULL CHECK (source_id IN ('CLIENT_ANSWER','CLIENT_DOC','SURVEYOR','CTA')),
  recorded_by   TEXT NOT NULL REFERENCES users(id),
  recorded_at   TEXT NOT NULL,
  withdrawn_by  TEXT REFERENCES users(id),
  withdrawn_at  TEXT,
  CHECK ((withdrawn_at IS NULL) = (withdrawn_by IS NULL))
) STRICT;

CREATE UNIQUE INDEX claim_owner_chain_position_uq ON claim_owner_chain(claim_id, position) WHERE withdrawn_at IS NULL;

CREATE TRIGGER claim_owner_chain_no_delete BEFORE DELETE ON claim_owner_chain
BEGIN SELECT RAISE(ABORT, 'an owner in the chain is withdrawn, never deleted'); END;

CREATE TRIGGER claim_owner_chain_only_withdrawn BEFORE UPDATE ON claim_owner_chain
WHEN OLD.withdrawn_at IS NOT NULL
  OR NEW.id IS NOT OLD.id OR NEW.claim_id IS NOT OLD.claim_id OR NEW.position IS NOT OLD.position
  OR NEW.owner IS NOT OLD.owner OR NEW.acquired_on IS NOT OLD.acquired_on OR NEW.ceased_on IS NOT OLD.ceased_on
  OR NEW.claimed IS NOT OLD.claimed OR NEW.source_id IS NOT OLD.source_id
  OR NEW.recorded_by IS NOT OLD.recorded_by OR NEW.recorded_at IS NOT OLD.recorded_at
BEGIN SELECT RAISE(ABORT, 'an owner in the chain is withdrawn once; nothing else about it changes — record a new one'); END;


-- ---------------------------------------------------------------------------
-- 4 · THE TAX ADVISER'S SIGN-OFF — A RECORD, NOT A SIGNATURE
--
-- src/stubs/signature.ts contacts no provider and executes nothing, and this
-- table does not pretend otherwise: `kind` can only ever say so.
--
-- WHO, WHEN, SCOPE, WHICH SWITCH READINGS THEY CONFIRMED, A METHOD NOTE, THE
-- FIGURE THEY SIGNED, AND THE SURVEYOR'S COMMITMENT IT WAS SIGNED AGAINST —
-- which must be a commitment on a survey job on THIS claim. The record is
-- hashed when it is written and nothing about it ever changes. A reopen makes
-- a fresh sign-off necessary: the gate reads only one recorded since the claim
-- last entered TAX_ADVISER_SIGNOFF.
-- ---------------------------------------------------------------------------
CREATE TABLE tax_adviser_signoffs (
  id                    TEXT PRIMARY KEY,
  claim_id              TEXT NOT NULL REFERENCES claims(id),
  adviser               TEXT NOT NULL CHECK (length(trim(adviser)) BETWEEN 2 AND 300),
  credential            TEXT NOT NULL CHECK (length(trim(credential)) BETWEEN 2 AND 300),
  signed_on             TEXT NOT NULL CHECK (signed_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  scope                 TEXT NOT NULL CHECK (length(trim(scope)) BETWEEN 1 AND 4000),
  method_note           TEXT NOT NULL CHECK (length(trim(method_note)) BETWEEN 1 AND 4000),
  switch_readings_json  TEXT NOT NULL CHECK (json_valid(switch_readings_json) AND json_type(switch_readings_json) = 'array'),
  figure_pence          INTEGER NOT NULL CHECK (figure_pence > 0),
  commitment_id         TEXT NOT NULL REFERENCES surveyor_commitments(id),
  kind                  TEXT NOT NULL CHECK (kind = 'RECORD_NOT_A_SIGNATURE'),
  record_hash           TEXT NOT NULL CHECK (length(record_hash) = 64),
  recorded_by           TEXT NOT NULL REFERENCES users(id),
  recorded_at           TEXT NOT NULL
) STRICT;

CREATE INDEX tax_adviser_signoffs_claim_idx ON tax_adviser_signoffs(claim_id, recorded_at);

CREATE TRIGGER tax_adviser_signoffs_commitment_on_claim BEFORE INSERT ON tax_adviser_signoffs
WHEN NOT EXISTS (
  SELECT 1 FROM surveyor_commitments sc JOIN surveyor_jobs j ON j.id = sc.job_id
   WHERE sc.id = NEW.commitment_id AND j.claim_id = NEW.claim_id)
BEGIN SELECT RAISE(ABORT, 'a sign-off is recorded against a surveyor''s commitment on a survey job on this claim'); END;

CREATE TRIGGER tax_adviser_signoffs_no_update BEFORE UPDATE ON tax_adviser_signoffs
BEGIN SELECT RAISE(ABORT, 'a sign-off record never changes: a later sign-off is a new record'); END;

CREATE TRIGGER tax_adviser_signoffs_no_delete BEFORE DELETE ON tax_adviser_signoffs
BEGIN SELECT RAISE(ABORT, 'a sign-off record is never deleted'); END;

-- THE COLUMN CRM 2 OF 10 BUILT THE GATE AGAINST, RETIRED. Nothing ever wrote it;
-- now nothing can, so a date typed into it can never stand in for the record.
CREATE TRIGGER claims_signoff_column_retired_update BEFORE UPDATE OF tax_adviser_signoff_at ON claims
WHEN NEW.tax_adviser_signoff_at IS NOT OLD.tax_adviser_signoff_at
BEGIN SELECT RAISE(ABORT, 'E_SIGNOFF_IS_A_RECORD: the tax adviser''s sign-off is a record in tax_adviser_signoffs, never a date on the claim'); END;

CREATE TRIGGER claims_signoff_column_retired_insert BEFORE INSERT ON claims
WHEN NEW.tax_adviser_signoff_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'E_SIGNOFF_IS_A_RECORD: the tax adviser''s sign-off is a record in tax_adviser_signoffs, never a date on the claim'); END;


-- ---------------------------------------------------------------------------
-- 5 · THE RECONCILIATION LOG — one row per case, in the design's section 3
--
-- 08-monday-doc-exports/12830205681__Estimate-to-Outcome-Reconciliation-
-- Process-Design.md. Its field names are kept, in integer pence. Its quote and
-- its pre-submission figure are mapped onto what this build holds, and the
-- disposition table's row E64 says how:
--   estimate_A_indicative      the sealed estimate and the range the client saw
--   estimate_B_quoted          THE RANGE SHOWN BEFORE THE LETTER WAS SIGNED. The
--                              letter states no figure, so `b_value_pence` stays
--                              NULL — a range is not a figure, and a midpoint would
--                              be a number nobody quoted
--   the surveyor's figure      not in the design; kept beside it, sealed
--   estimate_C_pre_submission  the figure the tax adviser signed
--   outcome_D                  derived from the enquiry, or the window lapsing
--
-- THE SNAPSHOT IS FIXED WHEN THE ROW OPENS. Filing is recorded once; the variance
-- tag once; the outcome once. The variance figures are READ, never stored.
-- ---------------------------------------------------------------------------
CREATE TABLE claim_reconciliations (
  id                         TEXT PRIMARY KEY,
  claim_id                   TEXT NOT NULL UNIQUE REFERENCES claims(id),
  case_id                    TEXT NOT NULL,
  client_sector              TEXT NOT NULL,
  transaction_type           TEXT,
  a_value_pence              INTEGER CHECK (a_value_pence IS NULL OR a_value_pence > 0),
  a_range_low_pence          INTEGER,
  a_range_high_pence         INTEGER,
  a_date_captured            TEXT,
  a_estimate_hash            TEXT,
  a_engine_version           TEXT,
  b_value_pence              INTEGER CHECK (b_value_pence IS NULL),
  b_range_low_pence          INTEGER,
  b_range_high_pence         INTEGER,
  b_date_captured            TEXT,
  b_basis                    TEXT NOT NULL,
  surveyor_value_pence       INTEGER NOT NULL,
  surveyor_commitment_id     TEXT NOT NULL REFERENCES surveyor_commitments(id),
  surveyor_figures_hash      TEXT NOT NULL,
  c_value_pence              INTEGER NOT NULL CHECK (c_value_pence > 0),
  c_date_captured            TEXT NOT NULL,
  c_cta_reviewer             TEXT NOT NULL,
  c_signoff_id               TEXT NOT NULL REFERENCES tax_adviser_signoffs(id),
  opened_at                  TEXT NOT NULL,
  snapshot_hash              TEXT NOT NULL CHECK (length(snapshot_hash) = 64),
  filed_on                   TEXT CHECK (filed_on IS NULL OR filed_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  filed_recorded_by          TEXT REFERENCES users(id),
  filed_recorded_at          TEXT,
  variance_category          TEXT CHECK (variance_category IS NULL OR variance_category IN
                               ('ENGINE_READ','SCOPE_CHANGE','SURVEY_FINDING','STATUTORY_ELECTION_CONSTRAINT',
                                'HMRC_NEGOTIATION','RATE_LEGISLATION_CHANGE','CLIENT_WITHDRAWAL')),
  variance_notes             TEXT,
  variance_recorded_by       TEXT REFERENCES users(id),
  variance_recorded_at       TEXT,
  d_value_pence              INTEGER CHECK (d_value_pence IS NULL OR d_value_pence > 0),
  d_date_captured            TEXT,
  resolution_path            TEXT CHECK (resolution_path IS NULL OR resolution_path IN
                               ('NO_ENQUIRY_WINDOW_LAPSED','ENQUIRY_AGREED_AS_SUBMITTED','ENQUIRY_AGREED_REDUCED',
                                'ENQUIRY_AGREED_INCREASED','WITHDRAWN_NO_CLAIM')),
  hmrc_enquiry_opened        INTEGER CHECK (hmrc_enquiry_opened IS NULL OR hmrc_enquiry_opened IN (0,1)),
  amount_realised_pence      INTEGER CHECK (amount_realised_pence IS NULL OR amount_realised_pence > 0),
  outcome_recorded_by        TEXT REFERENCES users(id),
  outcome_recorded_at        TEXT,
  status                     TEXT NOT NULL CHECK (status IN ('OPEN_OUTCOME_PENDING','RECONCILED')),
  CHECK ((filed_on IS NULL) = (filed_recorded_at IS NULL) AND (filed_on IS NULL) = (filed_recorded_by IS NULL)),
  CHECK ((variance_category IS NULL) = (variance_recorded_at IS NULL) AND (variance_category IS NULL) = (variance_recorded_by IS NULL)),
  CHECK ((resolution_path IS NULL) = (outcome_recorded_at IS NULL) AND (resolution_path IS NULL) = (outcome_recorded_by IS NULL)),
  CHECK ((status = 'RECONCILED') = (resolution_path IS NOT NULL)),
  CHECK (resolution_path IS NULL OR resolution_path = 'WITHDRAWN_NO_CLAIM' OR d_value_pence IS NOT NULL)
) STRICT;

CREATE TRIGGER claim_reconciliations_no_delete BEFORE DELETE ON claim_reconciliations
BEGIN SELECT RAISE(ABORT, 'a reconciliation is never deleted'); END;

CREATE TRIGGER claim_reconciliations_set_once BEFORE UPDATE ON claim_reconciliations
WHEN NEW.id IS NOT OLD.id OR NEW.claim_id IS NOT OLD.claim_id OR NEW.case_id IS NOT OLD.case_id
  OR NEW.client_sector IS NOT OLD.client_sector OR NEW.transaction_type IS NOT OLD.transaction_type
  OR NEW.a_value_pence IS NOT OLD.a_value_pence OR NEW.a_range_low_pence IS NOT OLD.a_range_low_pence
  OR NEW.a_range_high_pence IS NOT OLD.a_range_high_pence OR NEW.a_date_captured IS NOT OLD.a_date_captured
  OR NEW.a_estimate_hash IS NOT OLD.a_estimate_hash OR NEW.a_engine_version IS NOT OLD.a_engine_version
  OR NEW.b_range_low_pence IS NOT OLD.b_range_low_pence OR NEW.b_range_high_pence IS NOT OLD.b_range_high_pence
  OR NEW.b_date_captured IS NOT OLD.b_date_captured OR NEW.b_basis IS NOT OLD.b_basis
  OR NEW.surveyor_value_pence IS NOT OLD.surveyor_value_pence OR NEW.surveyor_commitment_id IS NOT OLD.surveyor_commitment_id
  OR NEW.surveyor_figures_hash IS NOT OLD.surveyor_figures_hash
  OR NEW.c_value_pence IS NOT OLD.c_value_pence OR NEW.c_date_captured IS NOT OLD.c_date_captured
  OR NEW.c_cta_reviewer IS NOT OLD.c_cta_reviewer OR NEW.c_signoff_id IS NOT OLD.c_signoff_id
  OR NEW.opened_at IS NOT OLD.opened_at OR NEW.snapshot_hash IS NOT OLD.snapshot_hash
  OR (OLD.filed_on IS NOT NULL AND (NEW.filed_on IS NOT OLD.filed_on OR NEW.filed_recorded_by IS NOT OLD.filed_recorded_by
        OR NEW.filed_recorded_at IS NOT OLD.filed_recorded_at))
  OR (OLD.variance_category IS NOT NULL AND (NEW.variance_category IS NOT OLD.variance_category
        OR NEW.variance_notes IS NOT OLD.variance_notes OR NEW.variance_recorded_by IS NOT OLD.variance_recorded_by
        OR NEW.variance_recorded_at IS NOT OLD.variance_recorded_at))
  OR (OLD.variance_category IS NULL AND NEW.variance_category IS NULL AND NEW.variance_notes IS NOT OLD.variance_notes)
  OR (OLD.resolution_path IS NOT NULL AND (NEW.resolution_path IS NOT OLD.resolution_path OR NEW.d_value_pence IS NOT OLD.d_value_pence
        OR NEW.d_date_captured IS NOT OLD.d_date_captured OR NEW.hmrc_enquiry_opened IS NOT OLD.hmrc_enquiry_opened
        OR NEW.amount_realised_pence IS NOT OLD.amount_realised_pence OR NEW.outcome_recorded_by IS NOT OLD.outcome_recorded_by
        OR NEW.outcome_recorded_at IS NOT OLD.outcome_recorded_at OR NEW.status IS NOT OLD.status))
  OR (OLD.resolution_path IS NULL AND NEW.resolution_path IS NULL AND (NEW.d_value_pence IS NOT OLD.d_value_pence
        OR NEW.d_date_captured IS NOT OLD.d_date_captured OR NEW.hmrc_enquiry_opened IS NOT OLD.hmrc_enquiry_opened
        OR NEW.amount_realised_pence IS NOT OLD.amount_realised_pence))
BEGIN SELECT RAISE(ABORT, 'a reconciliation''s snapshot is fixed when it opens, and its filing, its variance tag and its outcome are each recorded once'); END;


-- ---------------------------------------------------------------------------
-- 6 · THE DELIVERABLES REGISTER — tracked, never generated (Developer Spec W10)
--
-- ONE ROW PER VERSION. A kind with no row reads NOT_STARTED; a row is written
-- at DRAFT, moves once to ISSUED with its issue date, and — for every kind but
-- the defence pack — once to SUPERSEDED when the next version is issued. AN
-- ISSUED DEFENCE PACK NEVER CHANGES AT ALL, and its hash is required to issue it.
--
-- EACH KIND IS A DOCUMENT OF ONE TYPE (013), fixed by the table. Every one of
-- those types has NO RECEIPT POLICY, so none can be stored yet: the link to the
-- document is NULL until one can, and is set once.
-- ---------------------------------------------------------------------------
CREATE TABLE claim_deliverables (
  id                   TEXT PRIMARY KEY,
  claim_id             TEXT NOT NULL REFERENCES claims(id),
  kind                 TEXT NOT NULL CHECK (kind IN
                         ('CLIENT_REPORT','ACCOUNTANT_COMPUTATION_PACK','REASONED_NEGATIVE','DEFENCE_PACK','S203_NOTIFICATION')),
  version              INTEGER NOT NULL CHECK (version >= 1),
  document_type        TEXT NOT NULL REFERENCES document_types(code),
  state                TEXT NOT NULL CHECK (state IN ('NOT_STARTED','DRAFT','ISSUED','SUPERSEDED')),
  issued_on            TEXT CHECK (issued_on IS NULL OR issued_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  content_hash         TEXT CHECK (content_hash IS NULL OR (length(content_hash) = 64 AND content_hash NOT GLOB '*[^0-9a-f]*')),
  logical_document_id  TEXT REFERENCES logical_documents(id),
  created_by           TEXT NOT NULL REFERENCES users(id),
  created_at           TEXT NOT NULL,
  updated_by           TEXT NOT NULL REFERENCES users(id),
  updated_at           TEXT NOT NULL,
  UNIQUE (claim_id, kind, version),
  CHECK ((kind = 'CLIENT_REPORT' AND document_type = 'CA_REPORT')
      OR (kind = 'ACCOUNTANT_COMPUTATION_PACK' AND document_type = 'TAX_COMPUTATION')
      OR (kind = 'REASONED_NEGATIVE' AND document_type = 'CLAIM_DOCUMENTATION')
      OR (kind = 'DEFENCE_PACK' AND document_type = 'CLAIM_DOCUMENTATION')
      OR (kind = 'S203_NOTIFICATION' AND document_type = 'CORRESPONDENCE')),
  CHECK ((state IN ('ISSUED','SUPERSEDED')) = (issued_on IS NOT NULL)),
  CHECK (kind <> 'DEFENCE_PACK' OR state NOT IN ('ISSUED','SUPERSEDED') OR content_hash IS NOT NULL),
  CHECK (kind <> 'DEFENCE_PACK' OR state <> 'SUPERSEDED')
) STRICT;

CREATE INDEX claim_deliverables_claim_idx ON claim_deliverables(claim_id, kind, version);
-- One version of a kind in progress at a time.
CREATE UNIQUE INDEX claim_deliverables_one_draft_uq ON claim_deliverables(claim_id, kind) WHERE state = 'DRAFT';

CREATE TRIGGER claim_deliverables_starts_as_draft BEFORE INSERT ON claim_deliverables
WHEN NEW.state <> 'DRAFT' OR NEW.issued_on IS NOT NULL OR NEW.content_hash IS NOT NULL
  OR NEW.version <> (SELECT COALESCE(MAX(x.version), 0) + 1 FROM claim_deliverables x WHERE x.claim_id = NEW.claim_id AND x.kind = NEW.kind)
BEGIN SELECT RAISE(ABORT, 'a deliverable version is written as a draft, and takes the next number of its kind on its claim'); END;

CREATE TRIGGER claim_deliverables_no_delete BEFORE DELETE ON claim_deliverables
BEGIN SELECT RAISE(ABORT, 'a deliverable is never deleted: a later version supersedes it'); END;

CREATE TRIGGER claim_deliverables_moves_forward BEFORE UPDATE ON claim_deliverables
WHEN NEW.id IS NOT OLD.id OR NEW.claim_id IS NOT OLD.claim_id OR NEW.kind IS NOT OLD.kind
  OR NEW.version IS NOT OLD.version OR NEW.document_type IS NOT OLD.document_type
  OR NEW.created_by IS NOT OLD.created_by OR NEW.created_at IS NOT OLD.created_at
  OR (OLD.kind = 'DEFENCE_PACK' AND OLD.state = 'ISSUED')
  OR NOT ((OLD.state = NEW.state AND OLD.state = 'DRAFT')
       OR (OLD.state = 'DRAFT' AND NEW.state = 'ISSUED')
       OR (OLD.state = 'ISSUED' AND NEW.state = 'SUPERSEDED'))
  OR (OLD.state IN ('ISSUED','SUPERSEDED') AND (NEW.issued_on IS NOT OLD.issued_on OR NEW.content_hash IS NOT OLD.content_hash))
  OR (OLD.logical_document_id IS NOT NULL AND NEW.logical_document_id IS NOT OLD.logical_document_id)
BEGIN SELECT RAISE(ABORT, 'a deliverable moves forward only — draft, issued, superseded — and an issued defence pack never changes'); END;

CREATE TRIGGER claim_deliverables_document_of_its_claim BEFORE UPDATE OF logical_document_id ON claim_deliverables
WHEN NEW.logical_document_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM logical_documents l JOIN claims c ON c.business_id = l.business_id
   WHERE l.id = NEW.logical_document_id AND c.id = NEW.claim_id AND l.type_code = NEW.document_type)
BEGIN SELECT RAISE(ABORT, 'a deliverable is a document of its own type, of its own claim''s organisation'); END;


-- ---------------------------------------------------------------------------
-- 7 · HMRC ENQUIRIES — aftercare on the claim
--
-- Opened, closed with an outcome, and nothing edited after either. One open
-- enquiry per claim. The correspondence is documents of type CORRESPONDENCE,
-- which has no receipt policy — so it cannot be stored yet, and nothing here
-- pretends to hold it.
-- ---------------------------------------------------------------------------
CREATE TABLE hmrc_enquiries (
  id                    TEXT PRIMARY KEY,
  claim_id              TEXT NOT NULL REFERENCES claims(id),
  opened_on             TEXT NOT NULL CHECK (opened_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  note                  TEXT,
  opened_by             TEXT NOT NULL REFERENCES users(id),
  opened_recorded_at    TEXT NOT NULL,
  closed_on             TEXT CHECK (closed_on IS NULL OR closed_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  outcome               TEXT CHECK (outcome IS NULL OR outcome IN ('NO_CHANGE','AMENDED_DOWN','AMENDED_UP')),
  amended_figure_pence  INTEGER CHECK (amended_figure_pence IS NULL OR amended_figure_pence > 0),
  closed_by             TEXT REFERENCES users(id),
  closed_recorded_at    TEXT,
  CHECK ((closed_on IS NULL) = (outcome IS NULL) AND (closed_on IS NULL) = (closed_by IS NULL)
     AND (closed_on IS NULL) = (closed_recorded_at IS NULL)),
  CHECK ((outcome IN ('AMENDED_DOWN','AMENDED_UP')) = (amended_figure_pence IS NOT NULL)),
  CHECK (closed_on IS NULL OR closed_on >= opened_on)
) STRICT;

CREATE UNIQUE INDEX hmrc_enquiries_one_open_uq ON hmrc_enquiries(claim_id) WHERE closed_on IS NULL;

CREATE TRIGGER hmrc_enquiries_no_delete BEFORE DELETE ON hmrc_enquiries
BEGIN SELECT RAISE(ABORT, 'an enquiry is never deleted'); END;

CREATE TRIGGER hmrc_enquiries_closed_once BEFORE UPDATE ON hmrc_enquiries
WHEN OLD.closed_on IS NOT NULL
  OR NEW.id IS NOT OLD.id OR NEW.claim_id IS NOT OLD.claim_id OR NEW.opened_on IS NOT OLD.opened_on
  OR NEW.note IS NOT OLD.note OR NEW.opened_by IS NOT OLD.opened_by OR NEW.opened_recorded_at IS NOT OLD.opened_recorded_at
BEGIN SELECT RAISE(ABORT, 'an enquiry is closed once, with its outcome; nothing about its opening changes'); END;


-- ---------------------------------------------------------------------------
-- 8 · A SALE IN PROSPECT, ON THE PROPERTY
--
-- A disposal date records a sale that has happened; this records one that is
-- coming. Either raises a task pointing at the Disposal Note — the election on
-- a future sale — in src/web/claim-record.ts. YES, NO or UNKNOWN; never asked
-- is NULL and reads as UNKNOWN does, and neither raises anything.
-- ---------------------------------------------------------------------------
ALTER TABLE properties ADD COLUMN sale_in_prospect TEXT CHECK (sale_in_prospect IN ('YES','NO','UNKNOWN'));
