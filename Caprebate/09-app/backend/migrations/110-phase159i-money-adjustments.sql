-- ===========================================================================
-- 110 — THE MONEY ADJUSTMENTS: WHO A GRANT WAS PAID TO, WHICH SPEND IT MET, EACH EVENT'S VAT    Phase 159i, 10 October 2026
--
-- The stress test of 9 October 2026 (C12, C23; Rulebook F, F-R12; the carried items of Phases 159c and 159e):
--
--   claim_grants.paid_to    CLIENT (as before) or PAST_OWNER. An earlier owner's grant lowered what that owner could
--                           claim, so it lowers the cap from the earlier sale (s.185, s.62), never the buyer's price.
--   claim_grants.event_id   the event on the building the grant paid for (property_events, migration 105), so a grant
--                           comes off that event's figure and not the purchase's. NULL: not recorded.
--   property_events.vat_pence  the VAT on an event's cost the client could not reclaim, in pence, added to that
--                           event's cost (its position stays in migration 105's `vat`).
--   claim fact VAT_CGS_ADJUSTMENT  a VAT capital goods scheme adjustment on the building, in pence: a fact and a note.
--
-- claim_grants_only_withdrawn is made again with the two new columns, so they too never change after recording.
-- claim_facts_key_insert is rebuilt with the new key, exactly as migrations 106 and 107 did.
-- ===========================================================================

ALTER TABLE claim_grants ADD COLUMN paid_to TEXT NOT NULL DEFAULT 'CLIENT' CHECK (paid_to IN ('CLIENT','PAST_OWNER'));
ALTER TABLE claim_grants ADD COLUMN event_id TEXT REFERENCES property_events(id);

DROP TRIGGER claim_grants_only_withdrawn;
CREATE TRIGGER claim_grants_only_withdrawn BEFORE UPDATE ON claim_grants
WHEN OLD.withdrawn_at IS NOT NULL
  OR NEW.id IS NOT OLD.id OR NEW.claim_id IS NOT OLD.claim_id OR NEW.kind IS NOT OLD.kind
  OR NEW.payer_class IS NOT OLD.payer_class OR NEW.amount_pence IS NOT OLD.amount_pence
  OR NEW.amount_basis IS NOT OLD.amount_basis OR NEW.traced IS NOT OLD.traced
  OR NEW.traced_elements IS NOT OLD.traced_elements OR NEW.source_id IS NOT OLD.source_id
  OR NEW.note IS NOT OLD.note OR NEW.recorded_by IS NOT OLD.recorded_by OR NEW.recorded_at IS NOT OLD.recorded_at
  OR NEW.paid_to IS NOT OLD.paid_to OR NEW.event_id IS NOT OLD.event_id
BEGIN SELECT RAISE(ABORT, 'a grant is withdrawn once, with who, when and why; nothing else about it changes — record a new one'); END;

ALTER TABLE property_events ADD COLUMN vat_pence INTEGER CHECK (vat_pence IS NULL OR vat_pence > 0);

DROP TRIGGER claim_facts_key_insert;

CREATE TRIGGER claim_facts_key_insert BEFORE INSERT ON claim_facts
WHEN NEW.fact_key NOT IN (
  'ACCOUNTING_PERIOD_START','ACCOUNTING_PERIOD_END','SUFFICIENT_PROFIT','AIA_HEADROOM','AIA_HEADROOM_AMOUNT',
  'POOL_SPLIT_MAIN','POOL_SPLIT_SPECIAL','SBA_QUALIFYING_EXPENDITURE',
  'ELECTION_EXISTS','ELECTION_SECTION','ELECTION_NOTIFIED_ON','ELECTION_VALUE','ELECTION_ELEMENTS',
  'ELECTION_TRIBUNAL_APPLIED_ON','ELECTION_TRIBUNAL_STATUS',
  'GRANTS_EXIST','ACQUISITION_COSTS','TRANSACTION_TAX','BUYER_ALTERATIONS','BUYER_ALTERATIONS_AMOUNT',
  'SCOTTISH_TAXPAYER','PARTNERSHIP_HAS_COMPANY_MEMBER','BOUGHT_THE_BUILDING',
  'GRANT_PROVIDER_CHECKED','GRANT_SPLIT_ADVISER_VIEW','STILL_OWNED',
  'CASH_BASIS','BOUGHT_NEW_FROM_DEVELOPER','SBA_STATEMENT_HELD',
  'VAT_CGS_ADJUSTMENT')
BEGIN SELECT RAISE(ABORT, 'claim_facts.fact_key is not a fact the claim captures'); END;
