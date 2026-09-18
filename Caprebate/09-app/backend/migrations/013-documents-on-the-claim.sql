-- ===========================================================================
-- 013 — DOCUMENTS ON THE CLAIM: TYPES, VERSIONS, LINKS AND REQUESTS.
--                                                     CRM 4 of 10, 11 Sep 2026
--
-- The scope is 09-app/CAPREBATE-CRM-DISPOSITION.md section 11, and every choice
-- below that is not obvious is recorded in its Part E, rows E34 onwards.
--
-- THERE IS STILL ONE UPLOAD HANDLER. Nothing here receives a byte. Every upload
-- goes through 04-phase-work/phase3/caprebate-upload-handler.ts by way of
-- src/web/uploads.ts, exactly as before; this file gives what the handler
-- received somewhere to belong.
--
-- WHAT IS ADDED, AND NOTHING ELSE CHANGES
--   document_types      the configurable list, seeded; each type says who may
--                       read it, its deletion clock (NULL is UNSET, shown as
--                       UNSET, never a default) and the receipt policy it is
--                       received under — or that it has none, and so cannot be
--                       received at all
--   logical_documents   "the lease": the thing whose uploads are its versions
--   document_links      a logical document to any number of claims and
--                       properties — one lease can serve two claims
--   documents           five columns: its logical document, its version number,
--                       its type, its OWN deletion clock, and the request it was
--                       uploaded against. EXTENDED, NEVER REBUILT
--   client_tasks        four columns: a question's kind — QUESTION or DOCUMENT —
--                       the type a DOCUMENT request asks for, its claim, and the
--                       upload that received it. EXTENDED, NEVER REBUILT
--
-- WHAT IS NOT IN THIS FILE, ON PURPOSE
--   A REQUEST TABLE. A document request is a client question of kind DOCUMENT:
--     it already says why, what it holds up, when it is due and who asked.
--   A REQUEST STATE COLUMN. REQUESTED, RECEIVED and WITHDRAWN are READ from
--     `state` — OPEN, ANSWERED, WITHDRAWN — so there is no second column that
--     could disagree with the first. src/web/documents.ts says the words.
--   A NAME. No column here holds a person's name, and the file name of a new
--     upload is derived, never typed by the client — the Dashboard Data
--     Specification's S3 row: "smith-lease-2019.pdf is a name in the filesystem".
--   AN EVENT LOG. The timeline reads these tables; a test holds that no event,
--     timeline or activity table exists.
--
-- NOTHING HERE IS EVER DELETED, AND NOTHING OVERWRITES. A type is retired, a
-- link is ended with who and when, and a version is a row that never changes
-- its document, its number, its type or its clock.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1 · DOCUMENT TYPES — a table ADMIN edits
--
-- `handler_type` IS THE RECEIPT POLICY, AND ONLY THIS FILE SETS ONE. It names
-- the upload handler's own document type whose receipt policy strips an upload
-- of this type. ONE TYPE PER POLICY (the partial unique index), so an upload the
-- handler classified maps back to exactly one type. A type with NO policy is a
-- real, visible type that CANNOT BE RECEIVED: the store refuses to issue an
-- upload link for it, and a request for it is refused, because the ingestion
-- module's own rule is that "a new document type must earn a policy entry before
-- an upload of it can be stored". A type ADMIN adds has none, by the trigger.
--
-- `readers` IS WHO MAY READ IT, asked of can() against the document itself:
--   CLAIM_EVIDENCE      Admin, Sales, a surveyor on an assigned job, the client
--   CLAIM_TEAM          Admin, Sales, and the client whose document it is
--   FINANCE             Admin, Accounting, and the client
--   ENGAGEMENT_LETTER   Admin, Sales, the client; Accounting once it is signed;
--                       never a surveyor — the letter carries the fee terms
--
-- `carries_value` IS N1. A type that can hold a claim value, a tax benefit or a
-- fee is never CLAIM_EVIDENCE, and once set it is never unset.
--
-- `retention_ref` IS THE DELETION CLOCK, AND NULL IS UNSET. The only clock the
-- Retention Procedure gives a client document is RET-7 — six years from the
-- later of the claim period's end and the report's delivery — DERIVED AND NOT
-- APPROVED, so it computes no date (src/web/documents.ts reads RET7.approved
-- from the ingestion module rather than repeating it). No type-specific period
-- exists anywhere for the CRM list's types, so every one of them is UNSET.
-- ---------------------------------------------------------------------------
CREATE TABLE document_types (
  code           TEXT PRIMARY KEY CHECK (length(code) BETWEEN 2 AND 60 AND code NOT GLOB '*[^A-Z0-9_]*'),
  label          TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 120),
  source         TEXT NOT NULL CHECK (source IN ('CRM_SPECIFICATION','STAGE_2_UPLOAD_LIST','EXTRACTION_SPECS','ADMIN')),
  handler_type   TEXT CHECK (handler_type IS NULL OR handler_type IN
                   ('PLANNING','FIRE_RISK_ASSESSMENT','OM_MANUAL','ASBESTOS_REGISTER','INSURANCE_REINSTATEMENT',
                    'LEASE','CONTRACTOR_COST_BREAKDOWN','BUILDING_REGS_COMPLETION','GRANT_FUNDING_AGREEMENT',
                    'CPSE_REPLIES','SALE_CONTRACT')),
  readers        TEXT NOT NULL CHECK (readers IN ('CLAIM_EVIDENCE','CLAIM_TEAM','FINANCE','ENGAGEMENT_LETTER')),
  carries_value  INTEGER NOT NULL CHECK (carries_value IN (0,1)),
  retention_ref  TEXT CHECK (retention_ref IS NULL OR retention_ref IN ('RET-7')),
  active         INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  ord            INTEGER NOT NULL,
  -- Where the type came from, and anything merged into it.
  note           TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  CHECK (carries_value = 0 OR readers <> 'CLAIM_EVIDENCE'),
  CHECK (source <> 'ADMIN' OR handler_type IS NULL)
) STRICT;

CREATE UNIQUE INDEX document_types_handler_uq ON document_types(handler_type) WHERE handler_type IS NOT NULL;

INSERT INTO document_types (code, label, source, handler_type, readers, carries_value, retention_ref, active, ord, note, created_at, updated_at) VALUES
  -- The Stage 2 document upload list, one type per subitem, each on its own receipt policy.
  ('OM_MANUAL', 'Operation and maintenance manuals', 'STAGE_2_UPLOAD_LIST', 'OM_MANUAL', 'CLAIM_EVIDENCE', 0, 'RET-7', 1, 10,
   'Stage 2 upload list: O&M manuals from any refurbishment — every piece of plant installed.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('GRANT_FUNDING_AGREEMENT', 'Grant or NHS premises funding agreement', 'STAGE_2_UPLOAD_LIST', 'GRANT_FUNDING_AGREEMENT', 'CLAIM_EVIDENCE', 0, 'RET-7', 1, 20,
   'Stage 2 upload list: where any spend was grant-funded. The extraction specification emits no deduction figure.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('ASBESTOS_REGISTER', 'Asbestos register', 'STAGE_2_UPLOAD_LIST', 'ASBESTOS_REGISTER', 'CLAIM_EVIDENCE', 0, 'RET-7', 1, 30,
   'Stage 2 upload list: room-by-room materials survey.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('LEASE', 'Lease, and any licence for alterations', 'STAGE_2_UPLOAD_LIST', 'LEASE', 'CLAIM_EVIDENCE', 0, 'RET-7', 1, 40,
   'Stage 2 upload list: decides who owns the fixtures. One lease can serve two claims — link it to both.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('CPSE_REPLIES', 'Pre-contract enquiry replies (CPSE)', 'STAGE_2_UPLOAD_LIST', 'CPSE_REPLIES', 'CLAIM_TEAM', 0, 'RET-7', 1, 50,
   'Stage 2 upload list: the s.187A pooling answer. Human read only; not claim evidence for a surveyor while the question whether company names may stay on conveyancing uploads is open.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('CONTRACTOR_COST_BREAKDOWN', 'Contractor''s elemental cost breakdown', 'STAGE_2_UPLOAD_LIST', 'CONTRACTOR_COST_BREAKDOWN', 'CLAIM_EVIDENCE', 0, 'RET-7', 1, 60,
   'Stage 2 upload list: where invoices exist they beat any apportionment.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('INSURANCE_REINSTATEMENT', 'Insurance reinstatement valuation', 'STAGE_2_UPLOAD_LIST', 'INSURANCE_REINSTATEMENT', 'CLAIM_EVIDENCE', 0, 'RET-7', 1, 70,
   'Stage 2 upload list: an independent rebuild cost estimate.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('FIRE_RISK_ASSESSMENT', 'Fire risk assessment', 'STAGE_2_UPLOAD_LIST', 'FIRE_RISK_ASSESSMENT', 'CLAIM_EVIDENCE', 0, 'RET-7', 1, 80,
   'Stage 2 upload list: nearly all qualifying plant, room by room.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('SALE_CONTRACT', 'Sale or purchase contract, and any s.198 election schedule', 'STAGE_2_UPLOAD_LIST', 'SALE_CONTRACT', 'CLAIM_TEAM', 0, 'RET-7', 1, 90,
   'Stage 2 upload list, WITH the CRM specification''s "purchase contract" merged in: one document, one receipt policy. Human read only; not claim evidence for a surveyor while the parties question is open.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('BUILDING_REGS_COMPLETION', 'Building Regulations completion certificate', 'STAGE_2_UPLOAD_LIST', 'BUILDING_REGS_COMPLETION', 'CLAIM_EVIDENCE', 0, 'RET-7', 1, 100,
   'Stage 2 upload list: what was actually built against what was approved.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  -- The one client-upload type the extraction specifications cover that the Stage 2 list does not.
  ('PLANNING', 'Planning permission and decision notice', 'EXTRACTION_SPECS', 'PLANNING', 'CLAIM_EVIDENCE', 0, 'RET-7', 1, 110,
   'The document pipeline''s planning specification. Representations and consultee responses are dropped before anything is written.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  -- The CRM specification's list. NO RECEIPT POLICY, SO NONE CAN BE RECEIVED YET, AND NO CLOCK.
  ('ENGAGEMENT_LETTER', 'Engagement letter', 'CRM_SPECIFICATION', NULL, 'ENGAGEMENT_LETTER', 1, NULL, 1, 200,
   'CRM specification 11.3. It carries the fee terms.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('COMPLETION_STATEMENT', 'Completion statement', 'CRM_SPECIFICATION', NULL, 'CLAIM_TEAM', 0, NULL, 1, 210,
   'CRM specification 11.3.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('VALUATION', 'Valuation', 'CRM_SPECIFICATION', NULL, 'CLAIM_EVIDENCE', 0, NULL, 1, 220,
   'CRM specification 11.3: a valuation of the property the client holds — not our estimate.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('ACCOUNTS', 'Accounts', 'CRM_SPECIFICATION', NULL, 'CLAIM_TEAM', 0, NULL, 1, 230,
   'CRM specification 11.3.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('TAX_COMPUTATION', 'Tax computation', 'CRM_SPECIFICATION', NULL, 'CLAIM_TEAM', 1, NULL, 1, 240,
   'CRM specification 11.3. An amended computation carries the benefit of the claim.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('INVOICE', 'Caprebate''s fee invoice', 'CRM_SPECIFICATION', NULL, 'FINANCE', 1, NULL, 1, 250,
   'CRM specification 11.3, "invoices", read as our own: it carries the fee. A contractor''s invoice is evidence and is its own type.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('CONTRACTOR_INVOICE', 'Contractor''s invoices for the works', 'CRM_SPECIFICATION', NULL, 'CLAIM_EVIDENCE', 0, NULL, 1, 255,
   'CRM specification 11.3, "invoices", read as the works'': the evidence a claim prefers to any apportionment.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('PLANS', 'Plans and drawings', 'CRM_SPECIFICATION', NULL, 'CLAIM_EVIDENCE', 0, NULL, 1, 260,
   'CRM specification 11.3. Not a planning permission, which is its own type.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('SURVEY_PHOTOS', 'Survey photographs', 'CRM_SPECIFICATION', NULL, 'CLAIM_EVIDENCE', 0, NULL, 1, 270,
   'CRM specification 11.3.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('SURVEY_REPORT', 'Survey report', 'CRM_SPECIFICATION', NULL, 'CLAIM_EVIDENCE', 0, NULL, 1, 280,
   'CRM specification 11.3: the surveyor''s own measured record.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('CA_REPORT', 'Capital allowances report', 'CRM_SPECIFICATION', NULL, 'CLAIM_TEAM', 1, NULL, 1, 290,
   'CRM specification 11.3. It states the claim.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('CLAIM_DOCUMENTATION', 'Claim documentation', 'CRM_SPECIFICATION', NULL, 'CLAIM_TEAM', 1, NULL, 1, 300,
   'CRM specification 11.3.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('CORRESPONDENCE', 'Correspondence', 'CRM_SPECIFICATION', NULL, 'CLAIM_TEAM', 0, NULL, 1, 310,
   'CRM specification 11.3. Correspondence inside an upload is removed by every receipt policy; this is a letter as a document of its own.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('OTHER', 'Other', 'CRM_SPECIFICATION', NULL, 'CLAIM_TEAM', 1, NULL, 1, 320,
   'CRM specification 11.3. Nobody can say what it holds, so it is read as though it holds a value.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));


-- ---------------------------------------------------------------------------
-- 2 · LOGICAL DOCUMENTS — "Lease 2": what an upload is a version of
--
-- NO TITLE. A typed title is where "Dr Patel's lease" would go. A logical
-- document is named by its type and its sequence within its organisation.
-- ---------------------------------------------------------------------------
CREATE TABLE logical_documents (
  id           TEXT PRIMARY KEY,
  business_id  TEXT NOT NULL REFERENCES businesses(id),
  type_code    TEXT NOT NULL REFERENCES document_types(code),
  seq          INTEGER NOT NULL CHECK (seq >= 1),
  created_by   TEXT NOT NULL REFERENCES users(id),
  created_at   TEXT NOT NULL,
  UNIQUE (business_id, type_code, seq)
) STRICT;

CREATE INDEX logical_documents_business_idx ON logical_documents(business_id);


-- ---------------------------------------------------------------------------
-- 3 · DOCUMENT LINKS — to any number of claims and properties
-- ---------------------------------------------------------------------------
CREATE TABLE document_links (
  id                   TEXT PRIMARY KEY,
  logical_document_id  TEXT NOT NULL REFERENCES logical_documents(id),
  claim_id             TEXT REFERENCES claims(id),
  property_id          TEXT REFERENCES properties(id),
  linked_by            TEXT NOT NULL REFERENCES users(id),
  linked_at            TEXT NOT NULL,
  unlinked_by          TEXT REFERENCES users(id),
  unlinked_at          TEXT,
  CHECK ((claim_id IS NULL) <> (property_id IS NULL)),
  CHECK ((unlinked_at IS NULL) = (unlinked_by IS NULL))
) STRICT;

CREATE UNIQUE INDEX document_links_claim_uq ON document_links(logical_document_id, claim_id)
  WHERE claim_id IS NOT NULL AND unlinked_at IS NULL;
CREATE UNIQUE INDEX document_links_property_uq ON document_links(logical_document_id, property_id)
  WHERE property_id IS NOT NULL AND unlinked_at IS NULL;
CREATE INDEX document_links_claim_idx ON document_links(claim_id);
CREATE INDEX document_links_property_idx ON document_links(property_id);


-- ---------------------------------------------------------------------------
-- 4 · A VERSION — `documents`, extended
-- ---------------------------------------------------------------------------
ALTER TABLE documents ADD COLUMN logical_document_id TEXT REFERENCES logical_documents(id);
ALTER TABLE documents ADD COLUMN version_no INTEGER CHECK (version_no IS NULL OR version_no >= 1);
ALTER TABLE documents ADD COLUMN type_code TEXT REFERENCES document_types(code);
-- THE VERSION'S OWN CLOCK: the type's at the moment of upload, kept when the type's changes.
ALTER TABLE documents ADD COLUMN retention_ref TEXT CHECK (retention_ref IS NULL OR retention_ref IN ('RET-7'));
-- The request this upload was made against, where it was made against one.
ALTER TABLE documents ADD COLUMN request_id TEXT REFERENCES client_tasks(id);

CREATE UNIQUE INDEX documents_version_uq ON documents(logical_document_id, version_no) WHERE logical_document_id IS NOT NULL;
CREATE INDEX documents_logical_idx ON documents(logical_document_id);


-- ---------------------------------------------------------------------------
-- 5 · A DOCUMENT REQUEST — `client_tasks`, extended
-- ---------------------------------------------------------------------------
ALTER TABLE client_tasks ADD COLUMN kind TEXT NOT NULL DEFAULT 'QUESTION' CHECK (kind IN ('QUESTION','DOCUMENT'));
ALTER TABLE client_tasks ADD COLUMN requested_type TEXT REFERENCES document_types(code);
ALTER TABLE client_tasks ADD COLUMN claim_id TEXT REFERENCES claims(id);
ALTER TABLE client_tasks ADD COLUMN received_document_id TEXT REFERENCES documents(id);

CREATE INDEX client_tasks_claim_idx ON client_tasks(claim_id);


-- ---------------------------------------------------------------------------
-- 6 · THE UPLOADS ALREADY HELD BECOME VERSION 1 OF THEIR OWN DOCUMENT
--
-- Each is its own logical document. Two leases uploaded before today are NOT
-- guessed to be one lease: a wrong merge would make one the other's history.
-- An upload whose type matches no policy — refused at classification, or never
-- declared — stays a row with no version, and the screens say so.
-- ---------------------------------------------------------------------------
INSERT INTO logical_documents (id, business_id, type_code, seq, created_by, created_at)
SELECT 'ld-' || d.id, d.business_id, t.code,
       ROW_NUMBER() OVER (PARTITION BY d.business_id, t.code ORDER BY d.created_at, d.id),
       d.uploaded_by, d.created_at
FROM documents d JOIN document_types t ON t.handler_type = COALESCE(d.doc_type, d.declared_type);

UPDATE documents SET
  logical_document_id = 'ld-' || id,
  version_no = 1,
  type_code = (SELECT t.code FROM document_types t WHERE t.handler_type = COALESCE(documents.doc_type, documents.declared_type)),
  retention_ref = (SELECT t.retention_ref FROM document_types t WHERE t.handler_type = COALESCE(documents.doc_type, documents.declared_type))
WHERE EXISTS (SELECT 1 FROM document_types t WHERE t.handler_type = COALESCE(documents.doc_type, documents.declared_type));


-- ---------------------------------------------------------------------------
-- 7 · THE TRIGGERS — created after the carry-over, so they hold every new row
-- ---------------------------------------------------------------------------

-- Types
CREATE TRIGGER document_types_never_deleted BEFORE DELETE ON document_types
BEGIN SELECT RAISE(ABORT, 'a document type is retired by setting it inactive, never deleted: its documents still name it'); END;

CREATE TRIGGER document_types_fixed BEFORE UPDATE OF code, source, handler_type ON document_types
WHEN NEW.code IS NOT OLD.code OR NEW.source IS NOT OLD.source OR NEW.handler_type IS NOT OLD.handler_type
BEGIN SELECT RAISE(ABORT, 'a document type''s code, source and receipt policy are fixed: only a migration binds a type to a receipt policy'); END;

CREATE TRIGGER document_types_value_never_unset BEFORE UPDATE OF carries_value ON document_types
WHEN OLD.carries_value = 1 AND NEW.carries_value = 0
BEGIN SELECT RAISE(ABORT, 'a type that can carry a claim value, a tax benefit or a fee is never marked as not carrying one (N1)'); END;

-- Logical documents
CREATE TRIGGER logical_documents_never_deleted BEFORE DELETE ON logical_documents
BEGIN SELECT RAISE(ABORT, 'a document is never deleted: its versions and its links still name it'); END;

CREATE TRIGGER logical_documents_fixed BEFORE UPDATE ON logical_documents
BEGIN SELECT RAISE(ABORT, 'nothing about a document changes: a new upload is a new version, not an edit'); END;

CREATE TRIGGER logical_documents_seq_insert BEFORE INSERT ON logical_documents
WHEN NEW.seq <> (SELECT COALESCE(MAX(seq), 0) + 1 FROM logical_documents WHERE business_id = NEW.business_id AND type_code = NEW.type_code)
BEGIN SELECT RAISE(ABORT, 'a document takes the next number of its type within its organisation'); END;

-- Links
CREATE TRIGGER document_links_same_organisation BEFORE INSERT ON document_links
WHEN (NEW.claim_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM claims c JOIN logical_documents l ON l.business_id = c.business_id
        WHERE c.id = NEW.claim_id AND l.id = NEW.logical_document_id))
  OR (NEW.property_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM properties p JOIN logical_documents l ON l.business_id = p.business_id
        WHERE p.id = NEW.property_id AND l.id = NEW.logical_document_id))
  OR NEW.unlinked_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'a document links only to a claim or a property of its own organisation'); END;

CREATE TRIGGER document_links_never_deleted BEFORE DELETE ON document_links
BEGIN SELECT RAISE(ABORT, 'a link is ended by recording who unlinked it and when, never deleted'); END;

CREATE TRIGGER document_links_only_unlinked BEFORE UPDATE ON document_links
WHEN OLD.unlinked_at IS NOT NULL
  OR NEW.id IS NOT OLD.id OR NEW.logical_document_id IS NOT OLD.logical_document_id
  OR NEW.claim_id IS NOT OLD.claim_id OR NEW.property_id IS NOT OLD.property_id
  OR NEW.linked_by IS NOT OLD.linked_by OR NEW.linked_at IS NOT OLD.linked_at
BEGIN SELECT RAISE(ABORT, 'a link is ended once, by recording who unlinked it and when; nothing else about it changes'); END;

-- Versions
CREATE TRIGGER documents_never_deleted BEFORE DELETE ON documents
BEGIN SELECT RAISE(ABORT, 'a document version is never deleted: its own deletion clock governs the file, not the record'); END;

CREATE TRIGGER documents_version_insert BEFORE INSERT ON documents
WHEN ((NEW.logical_document_id IS NULL) <> (NEW.version_no IS NULL))
  OR (NEW.logical_document_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM logical_documents l
        WHERE l.id = NEW.logical_document_id AND l.business_id = NEW.business_id AND l.type_code IS NEW.type_code))
  OR (NEW.logical_document_id IS NOT NULL AND NEW.version_no <> (
        SELECT COALESCE(MAX(x.version_no), 0) + 1 FROM documents x WHERE x.logical_document_id = NEW.logical_document_id))
  OR (NEW.request_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM client_tasks ct
        WHERE ct.id = NEW.request_id AND ct.kind = 'DOCUMENT' AND ct.business_id = NEW.business_id
          AND ct.requested_type IS NEW.type_code AND ct.state = 'OPEN'))
BEGIN SELECT RAISE(ABORT, 'a version is the next number of a document of its own organisation and type, and is uploaded only against an open request for that type'); END;

-- A VERSION, once it is one, is fixed. A row that is not a version — an upload
-- from before versions existed that no policy matched — is left as it was, and
-- no row may become a version after it was written.
CREATE TRIGGER documents_nothing_overwrites BEFORE UPDATE OF
  logical_document_id, version_no, type_code, retention_ref, request_id, business_id, uploaded_by, filename, created_at ON documents
WHEN (OLD.logical_document_id IS NULL AND (NEW.logical_document_id IS NOT NULL OR NEW.version_no IS NOT NULL
        OR NEW.type_code IS NOT NULL OR NEW.retention_ref IS NOT NULL OR NEW.request_id IS NOT NULL))
  OR (OLD.logical_document_id IS NOT NULL AND (
        NEW.logical_document_id IS NOT OLD.logical_document_id OR NEW.version_no IS NOT OLD.version_no
        OR NEW.type_code IS NOT OLD.type_code OR NEW.retention_ref IS NOT OLD.retention_ref
        OR NEW.request_id IS NOT OLD.request_id OR NEW.business_id IS NOT OLD.business_id
        OR NEW.uploaded_by IS NOT OLD.uploaded_by OR NEW.filename IS NOT OLD.filename OR NEW.created_at IS NOT OLD.created_at))
BEGIN SELECT RAISE(ABORT, 'nothing overwrites: a version''s document, number, type, deletion clock, request, organisation, uploader and name are fixed when it is uploaded'); END;

-- Requests
CREATE TRIGGER client_tasks_kind_insert BEFORE INSERT ON client_tasks
WHEN (NEW.kind = 'QUESTION' AND (NEW.requested_type IS NOT NULL OR NEW.claim_id IS NOT NULL OR NEW.received_document_id IS NOT NULL))
  OR (NEW.kind = 'DOCUMENT' AND (NEW.requested_type IS NULL OR NEW.state <> 'OPEN' OR NEW.received_document_id IS NOT NULL OR NEW.fact_id IS NOT NULL))
BEGIN SELECT RAISE(ABORT, 'a question carries no requested type; a document request carries one, and is opened, never recorded already received'); END;

CREATE TRIGGER client_tasks_request_receivable_insert BEFORE INSERT ON client_tasks
WHEN NEW.kind = 'DOCUMENT' AND NOT EXISTS (
  SELECT 1 FROM document_types t WHERE t.code = NEW.requested_type AND t.handler_type IS NOT NULL AND t.active = 1)
BEGIN SELECT RAISE(ABORT, 'a document may be requested only of an active type that has a receipt policy: nothing else can ever be received'); END;

CREATE TRIGGER client_tasks_request_claim_insert BEFORE INSERT ON client_tasks
WHEN NEW.claim_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM claims c WHERE c.id = NEW.claim_id AND c.business_id = NEW.business_id)
BEGIN SELECT RAISE(ABORT, 'a document request''s claim must be of the request''s own organisation'); END;

CREATE TRIGGER client_tasks_request_fixed BEFORE UPDATE OF kind, requested_type, claim_id ON client_tasks
WHEN NEW.kind IS NOT OLD.kind OR NEW.requested_type IS NOT OLD.requested_type OR NEW.claim_id IS NOT OLD.claim_id
BEGIN SELECT RAISE(ABORT, 'a client question''s kind, requested type and claim do not change'); END;

-- RECEIVED IS SET BY AN UPLOAD, NEVER BY A CLICK. A document request reaches
-- ANSWERED only naming a version of the requested type, of its own organisation,
-- whose receipt strip is recorded and whose quarantine is discharged. A click has
-- no such version to name.
CREATE TRIGGER client_tasks_received_only_by_upload BEFORE UPDATE ON client_tasks
WHEN (OLD.kind = 'DOCUMENT' AND NEW.state = 'ANSWERED' AND OLD.state <> 'ANSWERED' AND NOT EXISTS (
        SELECT 1 FROM documents d
        WHERE d.id = NEW.received_document_id AND d.business_id = NEW.business_id AND d.type_code = NEW.requested_type
          AND d.strip_recorded_at IS NOT NULL AND d.quarantine_discharged_at IS NOT NULL AND d.failure_code IS NULL))
  OR (NEW.received_document_id IS NOT OLD.received_document_id
        AND NOT (OLD.kind = 'DOCUMENT' AND OLD.state = 'OPEN' AND NEW.state = 'ANSWERED'))
  OR (OLD.kind = 'DOCUMENT' AND OLD.state = 'ANSWERED' AND NEW.state IS NOT OLD.state)
BEGIN SELECT RAISE(ABORT, 'E_RECEIVED_ONLY_BY_UPLOAD: a document request is received by an upload of the requested type that has passed the receipt strip, never by a click'); END;
