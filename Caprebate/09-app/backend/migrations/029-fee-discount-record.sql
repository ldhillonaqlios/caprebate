-- ===========================================================================
-- 029 — A MULTI-SITE DISCOUNT, RECORDED AND NEVER APPLIED AUTOMATICALLY.
--                                                  Phase 132e, 16 September 2026
--
-- WHY. Lakhbir: a flat 3% of the allowances identified, and "A further
-- multi-site discount can be applied depending on site/opportunities". The old
-- 5% / 10% / 15% table is gone. How large a discount may be, and who approves
-- it, are NOT decided — the engine holds both as named nulls
-- (CB_FEE.MULTI_SITE_DISCOUNT) — so nothing here caps, approves or applies one.
--
-- WHAT THIS IS. A record that a person proposed a discount on a claim's fee:
-- how much (a share of our fee, in basis points), why, who and when — audited.
-- It is read back as AWAITING the decision on the largest discount and the
-- approver, and computeFee (src/web/fee-controls.ts) never reads this table, so
-- no invoice changes because a row is here. Append-only.
-- ===========================================================================

CREATE TABLE fee_discounts (
  id            TEXT PRIMARY KEY,
  claim_id      TEXT NOT NULL,
  business_id   TEXT NOT NULL,
  discount_bp   INTEGER NOT NULL CHECK (discount_bp BETWEEN 1 AND 10000),
  reason        TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 2 AND 2000),
  recorded_by   TEXT NOT NULL REFERENCES users(id),
  recorded_at   TEXT NOT NULL,
  FOREIGN KEY (claim_id, business_id) REFERENCES claims(id, business_id)
) STRICT;

CREATE INDEX fee_discounts_claim_idx ON fee_discounts(claim_id, recorded_at);

CREATE TRIGGER fee_discounts_no_update BEFORE UPDATE ON fee_discounts
BEGIN SELECT RAISE(ABORT, 'a proposed discount is kept as recorded: record a new one instead'); END;

CREATE TRIGGER fee_discounts_no_delete BEFORE DELETE ON fee_discounts
BEGIN SELECT RAISE(ABORT, 'a proposed discount is kept as recorded: record a new one instead'); END;
