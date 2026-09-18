-- ===========================================================================
-- 028 — A THIRD REWARD MODEL: A PERCENTAGE OF OUR FEE ACTUALLY INVOICED.
--                                                  Phase 132e, 16 September 2026
--
-- WHY. Lakhbir, answering "Is anything paid to the accountant?": an accountant
-- registered as an introducer may be offered 10% of our fee. Built as model C
-- beside A (no cash) and B (a fixed, disclosed fee), and SHIPPED OFF: the setting
-- stays OFF, and src/web/introducers.ts refuses C while clause 1 of the
-- engagement letter is blank, exactly as it refuses A and B.
--
-- WHAT C RECORDS. A ledger, never an edited amount:
--   ACCRUAL   when OUR FEE INVOICE is raised on a claim a registered accountancy
--             firm referred, while C is the setting: the percentage of the fee
--             actually invoiced (net of VAT) — never of a quote or an estimate.
--   REVERSAL  when that invoice is reduced under clause 13 by a credit note: a
--             negative entry of the same percentage of the amount credited,
--             never more than is left. The accrual is never deleted or changed.
--
-- THE SETTING TABLE IS REBUILT to widen its model CHECK and add the percentage.
-- The four triggers that name it are dropped first and recreated word for word
-- (014 lines 110-111 and 573-575; 016 lines 521-532).
-- ===========================================================================

DROP TRIGGER staff_tasks_reciprocity_under_model_a_insert;
DROP TRIGGER staff_tasks_reciprocity_under_model_a_update;
DROP TRIGGER introducer_fees_only_under_model_b;
DROP TRIGGER introducer_reward_setting_never_deleted;

CREATE TABLE introducer_reward_setting_new (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  model       TEXT NOT NULL CHECK (model IN ('OFF','A_RECIPROCITY','B_DISCLOSED_FEE','C_PERCENT_OF_INVOICED_FEE')),
  fee_pence   INTEGER CHECK (fee_pence IS NULL OR fee_pence > 0),
  -- Model C's percentage in basis points: 1000 is 10%.
  percent_bp  INTEGER CHECK (percent_bp IS NULL OR percent_bp BETWEEN 1 AND 10000),
  changed_by  TEXT REFERENCES users(id),
  changed_at  TEXT,
  CHECK (model <> 'B_DISCLOSED_FEE' OR fee_pence IS NOT NULL),
  CHECK (model <> 'C_PERCENT_OF_INVOICED_FEE' OR percent_bp IS NOT NULL)
) STRICT;

INSERT INTO introducer_reward_setting_new (id, model, fee_pence, percent_bp, changed_by, changed_at)
SELECT id, model, fee_pence, NULL, changed_by, changed_at FROM introducer_reward_setting;

DROP TABLE introducer_reward_setting;
ALTER TABLE introducer_reward_setting_new RENAME TO introducer_reward_setting;

CREATE TRIGGER introducer_reward_setting_never_deleted BEFORE DELETE ON introducer_reward_setting
BEGIN SELECT RAISE(ABORT, 'the reward setting is switched off, never deleted'); END;

CREATE TRIGGER introducer_fees_only_under_model_b BEFORE INSERT ON introducer_fees
WHEN NOT EXISTS (SELECT 1 FROM introducer_reward_setting s WHERE s.id = 1 AND s.model = 'B_DISCLOSED_FEE')
BEGIN SELECT RAISE(ABORT, 'E_REWARD_OFF: a fee to an introducer accrues only while reward model B is switched on'); END;

-- MODEL A'S RECIPROCITY: on a firm, and only while model A is the setting.
CREATE TRIGGER staff_tasks_reciprocity_under_model_a_insert BEFORE INSERT ON staff_tasks
WHEN NEW.activity_type IN ('CPD_SESSION','CO_BRANDED_ONE_PAGER','PRIORITY_TURNAROUND')
 AND (NEW.introducer_id IS NULL
      OR NOT EXISTS (SELECT 1 FROM introducer_reward_setting s WHERE s.id = 1 AND s.model = 'A_RECIPROCITY'))
BEGIN SELECT RAISE(ABORT, 'E_REWARD_OFF: reciprocity is a task on an introducer, and only while reward model A is switched on'); END;

CREATE TRIGGER staff_tasks_reciprocity_under_model_a_update BEFORE UPDATE OF activity_type, introducer_id ON staff_tasks
WHEN NEW.activity_type IN ('CPD_SESSION','CO_BRANDED_ONE_PAGER','PRIORITY_TURNAROUND')
 AND (NEW.activity_type IS NOT OLD.activity_type OR NEW.introducer_id IS NOT OLD.introducer_id)
 AND (NEW.introducer_id IS NULL
      OR NOT EXISTS (SELECT 1 FROM introducer_reward_setting s WHERE s.id = 1 AND s.model = 'A_RECIPROCITY'))
BEGIN SELECT RAISE(ABORT, 'E_REWARD_OFF: reciprocity is a task on an introducer, and only while reward model A is switched on'); END;

CREATE TABLE introducer_percentage_entries (
  id              TEXT PRIMARY KEY,
  introducer_id   TEXT NOT NULL REFERENCES introducers(id),
  claim_id        TEXT NOT NULL,
  business_id     TEXT NOT NULL,
  invoice_id      TEXT NOT NULL REFERENCES invoices(id),
  credit_note_id  TEXT REFERENCES invoice_credit_notes(id),
  entry_kind      TEXT NOT NULL CHECK (entry_kind IN ('ACCRUAL','REVERSAL')),
  -- ACCRUAL: our fee as invoiced, net of VAT. REVERSAL: the fee credited under clause 13, net of VAT.
  basis_pence     INTEGER NOT NULL CHECK (basis_pence > 0),
  percent_bp      INTEGER NOT NULL CHECK (percent_bp BETWEEN 1 AND 10000),
  amount_pence    INTEGER NOT NULL,
  recorded_by     TEXT REFERENCES users(id),
  created_at      TEXT NOT NULL,
  FOREIGN KEY (claim_id, business_id) REFERENCES claims(id, business_id),
  CHECK ((entry_kind = 'ACCRUAL' AND credit_note_id IS NULL AND amount_pence > 0)
      OR (entry_kind = 'REVERSAL' AND credit_note_id IS NOT NULL AND amount_pence < 0))
) STRICT;

CREATE UNIQUE INDEX introducer_percentage_one_accrual_per_invoice_uq ON introducer_percentage_entries(invoice_id) WHERE entry_kind = 'ACCRUAL';
CREATE UNIQUE INDEX introducer_percentage_one_reversal_per_credit_uq ON introducer_percentage_entries(credit_note_id) WHERE entry_kind = 'REVERSAL';
CREATE INDEX introducer_percentage_introducer_idx ON introducer_percentage_entries(introducer_id);

CREATE TRIGGER introducer_percentage_accrues_only_under_model_c BEFORE INSERT ON introducer_percentage_entries
WHEN NEW.entry_kind = 'ACCRUAL'
 AND NOT EXISTS (SELECT 1 FROM introducer_reward_setting s WHERE s.id = 1 AND s.model = 'C_PERCENT_OF_INVOICED_FEE')
BEGIN SELECT RAISE(ABORT, 'E_REWARD_OFF: a percentage of our fee accrues only while reward model C is switched on'); END;

CREATE TRIGGER introducer_percentage_to_the_referring_accountancy_firm BEFORE INSERT ON introducer_percentage_entries
WHEN NOT EXISTS (SELECT 1 FROM leads l JOIN introducers i ON i.id = l.introducer_id
                  WHERE l.claim_id = NEW.claim_id AND l.introducer_id = NEW.introducer_id AND i.introducer_type = 'ACCOUNTANT_FIRM')
BEGIN SELECT RAISE(ABORT, 'a percentage of our fee is owed only to the registered accountancy firm that referred the claim'); END;

CREATE TRIGGER introducer_percentage_on_our_fee_invoice BEFORE INSERT ON introducer_percentage_entries
WHEN NOT EXISTS (SELECT 1 FROM invoices v WHERE v.id = NEW.invoice_id AND v.claim_id = NEW.claim_id AND v.kind = 'FEE')
BEGIN SELECT RAISE(ABORT, 'a percentage is computed on our fee invoice on the same claim, and nothing else'); END;

CREATE TRIGGER introducer_percentage_reversal_follows_an_accrual BEFORE INSERT ON introducer_percentage_entries
WHEN NEW.entry_kind = 'REVERSAL' AND (
     NOT EXISTS (SELECT 1 FROM introducer_percentage_entries e WHERE e.invoice_id = NEW.invoice_id AND e.entry_kind = 'ACCRUAL')
  OR NOT EXISTS (SELECT 1 FROM invoice_credit_notes n WHERE n.id = NEW.credit_note_id AND n.invoice_id = NEW.invoice_id AND n.basis = 'CLAUSE_13_REDUCTION')
  OR (SELECT SUM(e.amount_pence) FROM introducer_percentage_entries e WHERE e.invoice_id = NEW.invoice_id) + NEW.amount_pence < 0)
BEGIN SELECT RAISE(ABORT, 'a reversal follows an accrual on the same invoice, for a clause 13 credit note on it, and never takes the total below nothing'); END;

CREATE TRIGGER introducer_percentage_entries_no_update BEFORE UPDATE ON introducer_percentage_entries
BEGIN SELECT RAISE(ABORT, 'a percentage entry is kept as recorded: a reduction is a reversing entry, never an edit'); END;

CREATE TRIGGER introducer_percentage_entries_no_delete BEFORE DELETE ON introducer_percentage_entries
BEGIN SELECT RAISE(ABORT, 'a percentage entry is kept as recorded: a reduction is a reversing entry, never a delete'); END;
