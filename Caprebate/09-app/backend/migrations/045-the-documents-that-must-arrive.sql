-- ===========================================================================
-- 045 — THE DOCUMENTS THAT MUST ARRIVE: A TAX RETURN TYPE, AND WHETHER THE CLIENT BOUGHT THE BUILDING.
--                                                            Phase 151, 24 September 2026
--
-- Lakhbir, Word answer 47 (closed 24 September 2026): the documents that must arrive before a claim moves on are the
-- sale contract, the CPSE replies, the tax returns and the tax computations. src/web/mandatory-documents.ts carries that
-- list, SWITCHED OFF until Word questions 220 ("Do the sale contract and the CPSE replies have to arrive only when the
-- client bought the building?") and 223 ("May we accept tax returns and tax computations as uploads, and what must be
-- removed from them?") are answered.
--
-- TWO THINGS IT NEEDED THAT DID NOT EXIST.
--
-- 1. A TAX RETURN DOCUMENT TYPE. The tax computation already is one (migration 013, from the CRM specification). The
--    return is added the same way: no receipt policy and no handler, so nothing can be received as one until question
--    223 says what must be removed from it; readers CLAIM_TEAM, and it carries value (a return carries the profits).
--    source 'ADMIN', because it was added on Lakhbir's word, not from a specification.
--
-- 2. A FACT: THE CLIENT BOUGHT THE BUILDING. The sale contract and the CPSE replies are asked only when the client
--    bought the building (the recommendation in question 220): a client who built or refitted it has neither. No record
--    held that fact — the acquisition date does not say HOW the building was acquired — so it is a claim fact, YES or
--    NO, captured on the facts panel. Not recorded, or recorded as not known, excuses nothing (N4).
--    claim_facts_key_insert is rebuilt with the key added, exactly as migration 024 did.
-- ===========================================================================

INSERT INTO document_types (code, label, source, handler_type, readers, carries_value, retention_ref, active, ord, note, created_at, updated_at) VALUES
  ('TAX_RETURN', 'Tax return', 'ADMIN', NULL, 'CLAIM_TEAM', 1, NULL, 1, 245,
   'Phase 151, Word answer 47: one of the four documents that must arrive. No receipt policy until Word question 223 says what must be removed from it.',
   strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

DROP TRIGGER claim_facts_key_insert;

CREATE TRIGGER claim_facts_key_insert BEFORE INSERT ON claim_facts
WHEN NEW.fact_key NOT IN (
  'ACCOUNTING_PERIOD_START','ACCOUNTING_PERIOD_END','SUFFICIENT_PROFIT','AIA_HEADROOM','AIA_HEADROOM_AMOUNT',
  'POOL_SPLIT_MAIN','POOL_SPLIT_SPECIAL','SBA_QUALIFYING_EXPENDITURE',
  'ELECTION_EXISTS','ELECTION_SECTION','ELECTION_NOTIFIED_ON','ELECTION_VALUE','ELECTION_ELEMENTS',
  'ELECTION_TRIBUNAL_APPLIED_ON','ELECTION_TRIBUNAL_STATUS',
  'GRANTS_EXIST','ACQUISITION_COSTS','TRANSACTION_TAX','BUYER_ALTERATIONS','BUYER_ALTERATIONS_AMOUNT',
  'SCOTTISH_TAXPAYER',
  'PARTNERSHIP_HAS_COMPANY_MEMBER',
  'BOUGHT_THE_BUILDING')
BEGIN SELECT RAISE(ABORT, 'claim_facts.fact_key is not a fact the claim captures'); END;
