-- ===========================================================================
-- 049 — THE TAX RETURN AND THE TAX COMPUTATION CAN BE UPLOADED.       Phase 151b, 25 September 2026
--
-- Word question 223, answered by the data protection officer and relayed by Lakhbir on 24 September 2026: "yes,
-- clients may upload tax returns and tax computations. Still open: what must be removed from them. Until the officer
-- says otherwise we will treat them like the other financial documents: keep the figures and the company details, and
-- remove individuals' names, addresses and tax references."
--
-- Until today neither type could be received: both had `handler_type` NULL (TAX_COMPUTATION from migration 013,
-- TAX_RETURN from migration 045), so the store refused an upload link and a request for either, and the must-arrive
-- documents switch (src/web/mandatory-documents.ts) had to stay off or it would stop every claim at the gate. The
-- upload handler now has a receipt policy for each, of its own name — TAX_RETURN and TAX_COMPUTATION in
-- 04-phase-work/phase3/caprebate-client-doc-ingestion.ts, derived from their specs in caprebate-document-pipeline.ts.
-- This file binds the two types to them. Binding is a migration's job and only a migration's (013's
-- `document_types_fixed`).
--
-- WHY A REBUILD, NOT AN UPDATE. Migration 021's header priced it: the handler_type CHECK lists the eleven policies and
-- SQLite cannot widen a CHECK in place, and `document_types_fixed` refuses any change of handler_type, so the table is
-- rebuilt with the CHECK widened and the trigger re-created around the change — following migration 019 to the letter.
--
-- ONE CHECK IS NARROWED BY NAME, NOT DROPPED. `source <> 'ADMIN' OR handler_type IS NULL` keeps a type added from the
-- settings screen from ever carrying a receipt policy. TAX_RETURN is source 'ADMIN' because migration 045 added it on
-- Lakhbir's word rather than from a specification — it was never added from the screen. The CHECK now allows that one
-- code and no other, so every type an administrator adds is still refused a policy, as before.
--
-- AND THE CLOCK. Each type is given RET-7, the one clock the Retention Procedure gives a client document, exactly as
-- every other received type carries it (migration 013). RET-7 is derived and not approved, so it computes no date.
--
-- WHAT HANGS OFF `document_types`, RE-DERIVED FROM sqlite_master ON A FRESHLY MIGRATED DATABASE ON 25 SEPTEMBER 2026,
-- NOT REMEMBERED:
--   on the table itself   the unique index document_types_handler_uq, and three triggers — document_types_never_deleted,
--                         document_types_fixed and document_types_value_never_unset — re-created here verbatim.
--   in the bodies of      automation_rules_request_receivable_insert and _update, client_tasks_request_receivable_insert
--   triggers on OTHER     and receipt_strip_recommendations_unbound_only: dropped first and re-created verbatim after,
--   tables                because SQLite re-parses every trigger on a RENAME.
--   by foreign key        automation_rules, claim_deliverables, client_tasks, documents, logical_documents and
--                         receipt_strip_recommendations name it by name, and survive the drop and rename with foreign
--                         keys off, as migrations 011 and 019 record. The guard at the foot proves none is broken.
--   No view names it.
-- test/phase151b-documents.test.ts reads every one of those names back.
--
-- NOTHING ELSE CHANGES. Every row is copied as it is; the recommendation row for the tax computation in migration 021
-- stays as the record of what the officer was asked (it is never deleted), and src/web/receipt-recommendations.ts now
-- reads it as bound.
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
                    'TAX_RETURN','TAX_COMPUTATION')),
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

-- 5 · THE BINDING. Each type to the receipt policy of its own name, and to RET-7.
UPDATE document_types_new
   SET handler_type = 'TAX_RETURN', retention_ref = 'RET-7',
       note = 'Phase 151, Word answer 47: one of the four documents that must arrive. Received from Phase 151b (Word question 223): the figures and the company details are kept; individuals'' names, addresses, National Insurance numbers and tax references, the preparer, signatures and the declaration are removed.',
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE code = 'TAX_RETURN';

UPDATE document_types_new
   SET handler_type = 'TAX_COMPUTATION', retention_ref = 'RET-7',
       note = 'CRM specification 11.3. An amended computation carries the benefit of the claim. Received from Phase 151b (Word question 223): the pool figures, the profit and the company details are kept; the preparer and any individual taxpayer''s name, address, tax reference and National Insurance number are removed.',
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE code = 'TAX_COMPUTATION';

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
