-- ===========================================================================
-- 106 — "DO YOU STILL OWN IT": THE FACT EACH EVENT'S ROUTE TURNS ON           Phase 159d, 9 October 2026
--
-- The stress test of 9 October 2026 (C1; the Lockwood run, L9): a company that bought a surgery in 2019, still owns it
-- and never claimed was turned away at Reports, because the amendment window for 2019 had closed. The law allows that
-- claim: the spend goes into the pool of the FIRST period whose return is still open, writing-down allowances only,
-- for as long as the client owns the building (CAA 2001 s.58(3)-(4); Rulebook A v2 sections 3, 4 and 4b). So each event
-- on a building now takes a route (src/web/claim-route.ts): W1 the window is open, W2 it is closed but the building is
-- still owned, W3 it is not owned, or the purchase fails the legal check.
--
-- STILL_OWNED, YES or NO, a claim fact on the facts panel. YES only on evidence — the client's checked answer, or the
-- current title register naming the client — and never while the property has a disposal date. Not recorded, or
-- recorded as not known, passes nothing (N4): a closed window with ownership not known is not W2.
-- claim_facts_key_insert is rebuilt with the key added, exactly as migrations 024, 045 and 078 did.
--
-- And C24: two claimant types, CHARITY_COMPANY and CHARITABLE_TRUST (at the end of this file).
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
  'STILL_OWNED')
BEGIN SELECT RAISE(ABORT, 'claim_facts.fact_key is not a fact the claim captures'); END;

-- C24 — WHICH KIND OF CHARITY. A charitable company files a company tax return, a charitable trust a trust return
-- under self assessment, and their amendment windows differ; a charity recorded without saying which stays not known.
-- The two claimant-type triggers of migration 009 are made again with both types added (src/web/crm.ts CLAIMANT_TYPES).
DROP TRIGGER businesses_claimant_type_insert;
DROP TRIGGER businesses_claimant_type_update;

CREATE TRIGGER businesses_claimant_type_insert BEFORE INSERT ON businesses
WHEN NEW.claimant_type IS NOT NULL AND NEW.claimant_type NOT IN
  ('COMPANY','LLP','PARTNERSHIP','SOLE_TRADER','INDIVIDUAL','CHARITY','CHARITY_COMPANY','CHARITABLE_TRUST','UNKNOWN')
BEGIN SELECT RAISE(ABORT, 'businesses.claimant_type is not on the claimant-type list'); END;

CREATE TRIGGER businesses_claimant_type_update BEFORE UPDATE OF claimant_type ON businesses
WHEN NEW.claimant_type IS NOT NULL AND NEW.claimant_type NOT IN
  ('COMPANY','LLP','PARTNERSHIP','SOLE_TRADER','INDIVIDUAL','CHARITY','CHARITY_COMPANY','CHARITABLE_TRUST','UNKNOWN')
BEGIN SELECT RAISE(ABORT, 'businesses.claimant_type is not on the claimant-type list'); END;
