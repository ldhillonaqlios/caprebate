-- ===========================================================================
-- 078 — A GRANT MATCHED TO THE FIXTURE LIST'S ROWS, AND TWO CLAIM FACTS ABOUT GRANTS
--                                                            Phase 153a, 4 October 2026
--
-- F-15's remainder (Rulebook F section 5: ".traced_elements[] — element codes with amounts. The field the whole
-- module turns on"). Until now a grant was matched only in words (claim_grants.traced_elements, free text), so nothing
-- could take it off the items it paid for. src/web/pack-grants.ts does that, in the survey pack's chapter 15, behind
-- the switch CB_CTA.grant_traced_to_elements, OFF as it ships.
--
-- 1. claim_grant_elements: the fixture-list rows (02-modules-and-build-prep/Caprebate-Fixture-Taxonomy-v1.csv,
--    element_id) a grant paid for. Written with the grant, in the same transaction, by F.recordGrant, which checks every
--    id against the list itself; the database checks the id's shape. A grant is never edited (migration 015), so its
--    rows are never edited or deleted either: a grant matched wrongly is withdrawn and recorded again.
--
-- 2. Two claim facts, YES or NO, captured on the facts panel. Not recorded, or recorded as not known, passes nothing
--    (N4). claim_facts_key_insert is rebuilt with both keys added, exactly as migrations 024 and 045 did.
--      GRANT_PROVIDER_CHECKED     the client has checked with whoever paid the grant that claiming will not make them
--                                 repay it (Word question 110: "Is a warning enough when claiming relief might force a
--                                 grant to be repaid?"; Phase 153b line 13, done here with the same grant data).
--      GRANT_SPLIT_ADVISER_VIEW   the tax adviser has given their view on how a grant with no breakdown is split (Word
--                                 question 109: "How should we split a grant when we cannot tell what it paid for?";
--                                 Phase 153b line 12). Counted only when the tax adviser is its source.
-- ===========================================================================

CREATE TABLE claim_grant_elements (
  grant_id    TEXT NOT NULL REFERENCES claim_grants(id),
  element_id  TEXT NOT NULL CHECK (element_id GLOB '[A-Z]*-[A-Z0-9]*-[0-9][0-9][0-9]*' AND element_id NOT GLOB '*[^A-Za-z0-9-]*' AND length(element_id) <= 20),
  PRIMARY KEY (grant_id, element_id)
) STRICT;

CREATE TRIGGER claim_grant_elements_no_update BEFORE UPDATE ON claim_grant_elements
BEGIN SELECT RAISE(ABORT, 'a grant''s items are recorded with it and never changed — withdraw the grant and record it again'); END;

CREATE TRIGGER claim_grant_elements_no_delete BEFORE DELETE ON claim_grant_elements
BEGIN SELECT RAISE(ABORT, 'a grant''s items are never deleted — withdraw the grant and record it again'); END;

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
  'GRANT_PROVIDER_CHECKED','GRANT_SPLIT_ADVISER_VIEW')
BEGIN SELECT RAISE(ABORT, 'claim_facts.fact_key is not a fact the claim captures'); END;
