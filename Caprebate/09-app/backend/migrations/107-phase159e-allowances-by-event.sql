-- ===========================================================================
-- 107 — THE ALLOWANCES ON EACH EVENT, AND THE FACTS THEY TURN ON          Phase 159e, 10 October 2026
--
-- The stress test of 9 October 2026 (C13, C15, C17, C18; the Lockwood run, L4): the return entries showed writing-down
-- allowances only, every spend in one period, the special rate pool at 6% in every year, and no structures allowance.
-- Now each part of a claim (the purchase, each piece of work) goes into the pool of its own period — W1 its own year,
-- W2 the first year still open — with its own first-year relief, and the structures and buildings allowance is worked
-- out (src/web/allowances.ts). Three facts on the claim decide parts of it, each YES/NO or a choice, recorded with its
-- source on the facts panel; not recorded, or recorded as not known, grants nothing (N4):
--
--   CASH_BASIS                 the accounts for the period are on the cash basis, or accruals. On the cash basis there
--                              is no claim on fixtures (OUR READING, Word question 260).
--   BOUGHT_NEW_FROM_DEVELOPER  the building was bought new and never used, from the developer who built it. Its
--                              fixtures are then not second-hand, so full expensing and the first-year allowances are
--                              open to them (OUR READING, Word question 258).
--   SBA_STATEMENT_HELD         the seller's structures and buildings allowance statement (s.270IA) is on file. With it,
--                              SBA_QUALIFYING_EXPENDITURE (already a key) is the figure the buyer's allowance runs on.
--
-- claim_facts_key_insert is rebuilt with the keys added, exactly as migrations 024, 045, 078 and 106 did.
--
-- And the facts a version's spreadsheet was sent on: return_entry_contexts gains facts_json, the claimant, the AIA
-- headroom, the cash basis and the structures allowance facts as they stood when it first left us (Phase 159a, C29:
-- once sent, never changed). NULL on every row sent before this phase, which reads exactly as it did.
-- ===========================================================================

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
  'BOUGHT_THE_BUILDING',
  'GRANT_PROVIDER_CHECKED','GRANT_SPLIT_ADVISER_VIEW',
  'STILL_OWNED',
  'CASH_BASIS','BOUGHT_NEW_FROM_DEVELOPER','SBA_STATEMENT_HELD')
BEGIN SELECT RAISE(ABORT, 'claim_facts.fact_key is not a fact the claim captures'); END;

ALTER TABLE return_entry_contexts ADD COLUMN facts_json TEXT CHECK (facts_json IS NULL OR json_valid(facts_json));
