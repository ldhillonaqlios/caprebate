-- ===========================================================================
-- 024 — ONE NEW CLAIM FACT: IS ANY PARTNER OR LLP MEMBER A COMPANY.
--                                                  Phase 132, 14 September 2026
--
-- WHY. TMA 1970 s.12ABA(4)(b), with s.12AA(5B): a partnership that includes
-- one or more companies has its return due on the first anniversary of the end
-- of the period, and s.12ABA(2) allows twelve months after that to amend. That
-- is the company's own window, not the individual partners' one, and against the
-- individual date it is earlier for period ends 6 April to 30 January and later
-- for 1 February to 5 April. The amendment window on the REPORTS and INVOICE
-- gates (src/web/claim-facts.ts, amendmentWindowReading) now reads the answer:
--   YES      the company date where it is earlier; where it is later, the
--            individual date until CB_CTA.window_company_member_date is on
--   NO       the individual date, exactly as before
--   UNKNOWN  exactly as no row at all: the window is OPEN only if open on both
--            dates, CLOSED only if closed on both, and otherwise UNKNOWN —
--            which neither gate passes
--
-- WHAT THIS MIGRATION DOES. claim_facts_key_insert (migration 015, lines 68–76,
-- and recreated by no later migration up to 023) refuses any fact key not on its
-- list. It is dropped and recreated with the same list plus
-- PARTNERSHIP_HAS_COMPANY_MEMBER, copied from 015 key for key and in the same
-- order. FACTS in src/web/claim-facts.ts holds the same list, as 015 requires.
-- No table, row or other trigger changes.
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
  'PARTNERSHIP_HAS_COMPANY_MEMBER')
BEGIN SELECT RAISE(ABORT, 'claim_facts.fact_key is not a fact the claim captures'); END;
