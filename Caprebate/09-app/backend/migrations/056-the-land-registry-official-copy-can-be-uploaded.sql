-- ===========================================================================
-- 056 — THE LAND REGISTRY OFFICIAL COPY CAN BE UPLOADED.             Phase 146l, 27 September 2026
--
-- Lakhbir, 25 September 2026: HM Land Registry's title register "will be done manually and not via API". And on 27
-- September: "i still need the certificate and information ect however ... human will get the information and type
-- and/or upload it" — the certificate being the paperwork (the official copy of the register and the title plan), not
-- the Business Gateway client certificate. Phase 146k built the typing (src/web/title-by-hand.ts, migration 055). This
-- is the upload: one new document type, TITLE_REGISTER, bound to the receipt policy of its own name in
-- 04-phase-work/phase3/caprebate-client-doc-ingestion.ts — WHOLE_DOCUMENT_PENDING_HUMAN_READ, because a person reads
-- it and no model ever does (HUMAN_READ_ONLY_TYPES in caprebate-document-pipeline.ts).
--
-- WHY A REBUILD. Exactly migration 049's reason, and exactly its steps: the handler_type CHECK lists the policies and
-- SQLite cannot widen a CHECK in place, and document_types_fixed refuses any change of handler_type — so the table is
-- rebuilt with the CHECK widened by one, the new row inserted already bound, and everything that hangs off the table
-- re-created verbatim. Migrations 050 to 055 add nothing that names document_types, re-derived from the files on 27
-- September 2026, so 049's list of what hangs off it is still the whole list. The guard at the foot proves no foreign
-- key broke. Every existing row is copied as it is.
-- ===========================================================================

-- 1 · foreign keys off. A no-op inside a transaction, so it goes FIRST.
PRAGMA foreign_keys = OFF;

-- 2 · one transaction. All of it, or none of it.
BEGIN;

-- 3 · the triggers on other tables that name document_types in their bodies.
DROP TRIGGER automation_rules_request_receivable_insert;
DROP TRIGGER automation_rules_request_receivable_update;
DROP TRIGGER client_tasks_request_receivable_insert;
DROP TRIGGER receipt_strip_recommendations_unbound_only;

-- 4 · the table, rebuilt with the two policies on its list.
CREATE TABLE document_types_new (
  code           TEXT PRIMARY KEY CHECK (length(code) BETWEEN 2 AND 60 AND code NOT GLOB '*[^A-Z0-9_]*'),
  label          TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 120),
  source         TEXT NOT NULL CHECK (source IN ('CRM_SPECIFICATION','STAGE_2_UPLOAD_LIST','EXTRACTION_SPECS','ADMIN')),
  handler_type   TEXT CHECK (handler_type IS NULL OR handler_type IN
                   ('PLANNING','FIRE_RISK_ASSESSMENT','OM_MANUAL','ASBESTOS_REGISTER','INSURANCE_REINSTATEMENT',
                    'LEASE','CONTRACTOR_COST_BREAKDOWN','BUILDING_REGS_COMPLETION','GRANT_FUNDING_AGREEMENT',
                    'CPSE_REPLIES','SALE_CONTRACT',
                    -- Phase 151b, Word question 223
                    'TAX_RETURN','TAX_COMPUTATION',
                    -- Phase 146l, the Land Registry official copy, read by a person
                    'TITLE_REGISTER')),
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
  -- A type added from the settings screen never carries a receipt policy. TAX_RETURN, added by migration 045 on
  -- Lakhbir's word, is the one ADMIN-source type a migration has bound, and it is named.
  CHECK (source <> 'ADMIN' OR handler_type IS NULL OR code = 'TAX_RETURN')
) STRICT;

INSERT INTO document_types_new (code, label, source, handler_type, readers, carries_value, retention_ref, active, ord, note, created_at, updated_at)
SELECT code, label, source, handler_type, readers, carries_value, retention_ref, active, ord, note, created_at, updated_at
  FROM document_types;

-- 5 · THE NEW TYPE, BOUND AS IT IS ADDED, to the receipt policy of its own name and to RET-7. It CARRIES A VALUE —
--     the price paid is the claim's anchor for four of the five sectors — so its readers are the claim team and never
--     claim evidence: a surveyor never reads it, exactly as the price is withheld from the surveyor's payload.
INSERT INTO document_types_new (code, label, source, handler_type, readers, carries_value, retention_ref, active, ord, note, created_at, updated_at) VALUES
  ('TITLE_REGISTER', 'HM Land Registry official copy and title plan', 'EXTRACTION_SPECS', 'TITLE_REGISTER', 'CLAIM_TEAM', 1, 'RET-7', 1, 125,
   'Phase 146l (Lakhbir, 25 and 27 September 2026): the title register is looked up by hand, not by the API. A person buys the official copy of the register and the title plan, uploads them here, and types what they say on the property page. Read by a person, never a model: a property held personally names its owner.',
   strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

DROP TABLE document_types;
ALTER TABLE document_types_new RENAME TO document_types;

-- 6 · what hangs off the table itself, verbatim.
CREATE UNIQUE INDEX document_types_handler_uq ON document_types(handler_type) WHERE handler_type IS NOT NULL;

CREATE TRIGGER document_types_never_deleted BEFORE DELETE ON document_types
BEGIN SELECT RAISE(ABORT, 'a document type is retired by setting it inactive, never deleted: its documents still name it'); END;

CREATE TRIGGER document_types_fixed BEFORE UPDATE OF code, source, handler_type ON document_types
WHEN NEW.code IS NOT OLD.code OR NEW.source IS NOT OLD.source OR NEW.handler_type IS NOT OLD.handler_type
BEGIN SELECT RAISE(ABORT, 'a document type''s code, source and receipt policy are fixed: only a migration binds a type to a receipt policy'); END;

CREATE TRIGGER document_types_value_never_unset BEFORE UPDATE OF carries_value ON document_types
WHEN OLD.carries_value = 1 AND NEW.carries_value = 0
BEGIN SELECT RAISE(ABORT, 'a type that can carry a claim value, a tax benefit or a fee is never marked as not carrying one (N1)'); END;

-- 7 · the triggers on other tables, verbatim.
CREATE TRIGGER automation_rules_request_receivable_insert BEFORE INSERT ON automation_rules
WHEN NEW.request_type IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM document_types t WHERE t.code = NEW.request_type AND t.handler_type IS NOT NULL AND t.active = 1)
BEGIN SELECT RAISE(ABORT, 'E_NO_RECEIPT_POLICY: a rule asks for a document only of a type something can receive'); END;

CREATE TRIGGER automation_rules_request_receivable_update BEFORE UPDATE OF request_type ON automation_rules
WHEN NEW.request_type IS NOT NULL AND NEW.request_type IS NOT OLD.request_type
 AND NOT EXISTS (SELECT 1 FROM document_types t WHERE t.code = NEW.request_type AND t.handler_type IS NOT NULL AND t.active = 1)
BEGIN SELECT RAISE(ABORT, 'E_NO_RECEIPT_POLICY: a rule asks for a document only of a type something can receive'); END;

CREATE TRIGGER client_tasks_request_receivable_insert BEFORE INSERT ON client_tasks
WHEN NEW.kind = 'DOCUMENT' AND NOT EXISTS (
  SELECT 1 FROM document_types t WHERE t.code = NEW.requested_type AND t.handler_type IS NOT NULL AND t.active = 1)
BEGIN SELECT RAISE(ABORT, 'a document may be requested only of an active type that has a receipt policy: nothing else can ever be received'); END;

CREATE TRIGGER receipt_strip_recommendations_unbound_only BEFORE INSERT ON receipt_strip_recommendations
WHEN EXISTS (SELECT 1 FROM document_types t WHERE t.code = NEW.type_code AND t.handler_type IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'a recommendation is for a type with no receipt policy: a bound type already has its policy'); END;

-- 8 · THE GUARD. Zero violations, or this migration does not happen at all.
CREATE TABLE _fk_check_guard (ok INTEGER NOT NULL CHECK (ok = 0)) STRICT;
INSERT INTO _fk_check_guard (ok) SELECT count(*) FROM pragma_foreign_key_check;
DROP TABLE _fk_check_guard;

-- 9 · commit.
COMMIT;

-- 10 · and back on.
PRAGMA foreign_keys = ON;
