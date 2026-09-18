-- ===========================================================================
-- 016 — FINANCE ON THE CLAIM: INVOICES, CREDIT NOTES, MONEY RECEIVED, A GAPLESS
-- NUMBER SERIES, THE DATED FINANCE SETTINGS, AND THE VAT MONITORING TASK.
--                                                     CRM 7 of 10, 11 Sep 2026
--
-- The scope is 09-app/CAPREBATE-CRM-DISPOSITION.md, section 13 and row B4, and
-- every choice below that is not obvious is recorded in its Part E, rows E78
-- onwards. The code is src/web/invoices.ts, src/web/fee-controls.ts and
-- src/web/vat.ts; the view is src/web/finance.ts and src/web/finance-pages.ts.
--
-- EXTENDED, NEVER REBUILT — WITH TWO REBUILDS, AND BOTH ARE A CHECK SQLITE
-- CANNOT WIDEN IN PLACE, following migrations 011 and 014 to the letter.
--   `invoices` gains the claim, and a foreign key (claim_id, business_id) onto
--     claims(id, business_id) is a table constraint: it cannot be added by
--     ALTER. Every row that exists is copied unchanged and stays what it was —
--     an organisation's invoice from before this migration, whose states were
--     typed — and none is moved onto a claim, because which claim it was for
--     was never recorded and a guess would be a record nobody made.
--   `staff_tasks` gains a task about Caprebate itself. The VAT threshold is
--     nobody's organisation, lead or firm, and the table's CHECK required one.
--
-- WHAT HANGS OFF THE TWO TABLES, RE-DERIVED FROM sqlite_master ON A FRESHLY
-- MIGRATED DATABASE ON 11 SEPTEMBER 2026, NOT REMEMBERED:
--   invoices     invoices_business_idx. No trigger on it or on any other table
--                names it, and no foreign key points at it.
--   staff_tasks  nine indexes and ten triggers, every one on the table itself,
--                exactly 014's. No trigger on another table names it. Referenced
--                by name by automation_runs.task_id (012) and by its own
--                recurred_from_id — a reference by name survives the drop and
--                rename with foreign keys off, as 011 and 014 record.
--
-- WHAT IS NOT IN THIS FILE, ON PURPOSE
--   AN OUTSTANDING BALANCE, A PAYMENT STATE OR AN OVERDUE FLAG ON A CLAIM'S
--     INVOICE. All three are READ from the invoice, its credit notes and the
--     money recorded against it. `payment_status` stays for the organisation's
--     old rows and is held at UNPAID on a claim's invoice by CHECK, so nothing
--     can type a state the rows beside it contradict.
--   A DEFAULT DUE DATE. The letter's payment terms are blank, so a claim's
--     invoice is raised with no due date, and it says why (`due_basis`).
--   A JOIN TO THE ANSWERS, THE REGISTER DATA, THE NOTES, THE SURVEYOR'S WORKINGS
--     OR THE ESTIMATE. The claim value and the facts the fee comparison needs are
--     COPIED ONTO THE INVOICE when it is raised, as migration 006 decided and for
--     its reason; no new table here has a column naming any of them, and
--     test/finance-claim.test.ts reads every new table's foreign keys to prove it.
--   A CARD, A MANDATE OR A BANK ACCOUNT. Money is recorded as received by a
--     person who saw it arrive, by bank transfer, and nothing here collects it.
-- ===========================================================================

-- 1 · foreign keys off. A no-op inside a transaction, so it goes FIRST.
PRAGMA foreign_keys = OFF;

-- 2 · one transaction. All of it, or none of it.
BEGIN;


-- ---------------------------------------------------------------------------
-- 3 · THE FINANCE SETTINGS — each a DATED value WITH ITS SOURCE, append-only
--
-- The current value of a setting is the latest row in effect on the day asked
-- about. A setting nobody has recorded is NO ROW, and every reader treats it as
-- not known: no VAT position means no invoice can be raised, and no threshold
-- means the monitoring says it cannot say — never a zero and never a pass (N4).
--
-- THE FOUR ROWS BELOW ARE READ FROM DOCUMENTS, NOT CHOSEN HERE, and each says
-- which. The threshold is dated the day GOV.UK was read for the VAT threshold
-- monitoring procedure, because that procedure records the figure and not the
-- day it came into force; a later row with its own date supersedes it.
-- ---------------------------------------------------------------------------
CREATE TABLE finance_settings (
  id             TEXT PRIMARY KEY,
  setting        TEXT NOT NULL CHECK (setting IN
                   ('VAT_POSITION','VAT_RATE','VAT_REGISTRATION_THRESHOLD_PENCE',
                    'VAT_WARNING_FRACTION','VAT_SINGLE_ENGAGEMENT_TRIGGER_PENCE')),
  value          TEXT NOT NULL CHECK (length(trim(value)) BETWEEN 1 AND 100),
  effective_from TEXT NOT NULL CHECK (effective_from GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  source         TEXT NOT NULL CHECK (length(trim(source)) BETWEEN 2 AND 1000),
  -- NULL only on the rows this migration writes from documents.
  recorded_by    TEXT REFERENCES users(id),
  recorded_at    TEXT NOT NULL,
  CHECK (setting <> 'VAT_POSITION' OR value IN ('NOT_REGISTERED','REGISTERED')),
  CHECK (setting NOT IN ('VAT_REGISTRATION_THRESHOLD_PENCE','VAT_SINGLE_ENGAGEMENT_TRIGGER_PENCE')
         OR (value GLOB '[1-9]*' AND value NOT GLOB '*[^0-9]*')),
  CHECK (setting NOT IN ('VAT_WARNING_FRACTION','VAT_RATE')
         OR (value GLOB '0.[0-9]*' AND value NOT GLOB '0.*[^0-9]*' AND CAST(value AS REAL) > 0))
) STRICT;

CREATE INDEX finance_settings_setting_idx ON finance_settings(setting, effective_from);

CREATE TRIGGER finance_settings_no_update BEFORE UPDATE ON finance_settings
BEGIN SELECT RAISE(ABORT, 'a finance setting is never changed: a new value is a new row with its own date and source'); END;

CREATE TRIGGER finance_settings_no_delete BEFORE DELETE ON finance_settings
BEGIN SELECT RAISE(ABORT, 'a finance setting is never deleted: an invoice may name the row it was raised under'); END;

INSERT INTO finance_settings (id, setting, value, effective_from, source, recorded_by, recorded_at) VALUES
  ('finance-setting-vat-position-2026-08-28', 'VAT_POSITION', 'NOT_REGISTERED', '2026-08-28',
   'Not VAT registered: the decision recorded in the VAT threshold monitoring procedure (08-monday-doc-exports/12552682452, prepared 28 August 2026) — wait until the threshold, do not register voluntarily — and stated to the client at clause 4 of the engagement letter.',
   NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('finance-setting-vat-threshold-2026-08-28', 'VAT_REGISTRATION_THRESHOLD_PENCE', '9000000', '2026-08-28',
   'GOV.UK, Register for VAT: when to register — £90,000 of taxable turnover, as read on 28 August 2026 and quoted in section 2 of the VAT threshold monitoring procedure. Dated the day it was read: the procedure does not record the day it came into force.',
   NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('finance-setting-vat-warning-2026-08-28', 'VAT_WARNING_FRACTION', '0.75', '2026-08-28',
   'The VAT threshold monitoring procedure, section 5, the traffic light: amber starts at 75% of the threshold, because the work before registration takes weeks.',
   NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('finance-setting-vat-single-2026-08-28', 'VAT_SINGLE_ENGAGEMENT_TRIGGER_PENCE', '2500000', '2026-08-28',
   'The VAT threshold monitoring procedure, section 5, check 3: any single engagement with an expected fee of £25,000 or more is checked against both tests the day it is agreed.',
   NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now'));


-- ---------------------------------------------------------------------------
-- 4 · INVOICES, REBUILT — AN INVOICE BELONGS TO A CLAIM
--
-- A CLAIM'S INVOICE is raised by the store in src/web/invoices.ts, and a CHECK
-- holds what it must carry: a date, a fee above nought, the claim value it was
-- taken from (for our fee), the VAT read from the recorded position and the row
-- it was read from, the words saying how the amount was reached, and the words
-- saying where the due date came from — which today is that there is none. It is
-- RAISED, SENT or CANCELLED; whether it is paid, credited, outstanding or overdue
-- is read from the rows beside it.
--
-- AN ORGANISATION'S INVOICE — a row from before this migration, claim_id NULL —
-- keeps its typed states and carries none of a claim's invoice's columns.
--
-- THE AMOUNTS ARE FIXED ONCE RAISED. The claim value is the engine's and the
-- tax adviser's; the fee derives from it; the VAT from the recorded position.
-- A trigger refuses any change to them, and a credit note is the only way a
-- raised amount changes.
-- ---------------------------------------------------------------------------
CREATE TABLE invoices_new (
  id                TEXT PRIMARY KEY,
  business_id       TEXT NOT NULL REFERENCES businesses(id),
  -- CRM 7 of 10: the claim. NULL only on an organisation's invoice from before it.
  claim_id          TEXT,
  kind              TEXT NOT NULL DEFAULT 'FEE' CHECK (kind IN ('FEE','BREAK_FEE','ABORT_FEE')),
  claim_value_pence INTEGER,
  fee_pence         INTEGER,
  fee_rate          REAL CHECK (fee_rate IS NULL OR (fee_rate > 0 AND fee_rate <= 1)),
  invoice_status    TEXT NOT NULL CHECK (invoice_status IN ('NOT_RAISED','RAISED','SENT','CREDITED','CANCELLED')),
  payment_status    TEXT NOT NULL CHECK (payment_status IN ('UNPAID','PART_PAID','PAID','WRITTEN_OFF')),
  -- Caprebate is NOT VAT registered (confirmed Phase 74). Recorded rather than
  -- assumed, because an invoice view that silently adds VAT would be wrong.
  vat_position      TEXT NOT NULL,
  vat_setting_id    TEXT REFERENCES finance_settings(id),
  vat_pence         INTEGER CHECK (vat_pence IS NULL OR vat_pence >= 0),
  invoice_date      TEXT CHECK (invoice_date IS NULL OR invoice_date GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  due_on            TEXT CHECK (due_on IS NULL OR due_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  due_basis         TEXT,
  sent_on           TEXT CHECK (sent_on IS NULL OR sent_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  fee_basis         TEXT,
  fee_warning       TEXT,
  raised_by         TEXT REFERENCES users(id),
  cancelled_at      TEXT,
  cancelled_by      TEXT REFERENCES users(id),
  cancel_reason     TEXT,
  created_at        TEXT NOT NULL,
  entity_type       TEXT CHECK (entity_type IN ('company','uninc_ruk','uninc_scot')),
  tax_rate          REAL,
  pool_split_main_pence    INTEGER,
  pool_split_special_pence INTEGER,
  period_start      TEXT,
  FOREIGN KEY (claim_id, business_id) REFERENCES claims(id, business_id),
  -- An organisation's invoice from before CRM 7 of 10 carries none of a claim's invoice's columns.
  CHECK (claim_id IS NOT NULL OR (kind = 'FEE' AND fee_rate IS NULL AND vat_setting_id IS NULL AND vat_pence IS NULL
         AND invoice_date IS NULL AND due_on IS NULL AND due_basis IS NULL AND sent_on IS NULL AND fee_basis IS NULL
         AND fee_warning IS NULL AND raised_by IS NULL AND cancelled_at IS NULL)),
  -- A claim's invoice: raised with everything it needs, and its payment state never typed.
  CHECK (claim_id IS NULL OR (invoice_status IN ('RAISED','SENT','CANCELLED') AND payment_status = 'UNPAID'
         AND invoice_date IS NOT NULL AND fee_pence IS NOT NULL AND fee_pence > 0 AND (kind <> 'FEE' OR fee_rate IS NOT NULL)
         AND vat_setting_id IS NOT NULL AND vat_pence IS NOT NULL AND fee_basis IS NOT NULL AND due_basis IS NOT NULL
         AND raised_by IS NOT NULL AND (kind <> 'FEE' OR claim_value_pence IS NOT NULL))),
  CHECK (claim_id IS NULL OR ((sent_on IS NOT NULL) = (invoice_status = 'SENT'))),
  CHECK (claim_id IS NULL OR ((cancelled_at IS NOT NULL) = (invoice_status = 'CANCELLED'))),
  CHECK ((cancelled_at IS NULL) = (cancelled_by IS NULL)),
  CHECK ((cancelled_at IS NULL) = (cancel_reason IS NULL)),
  CHECK (cancel_reason IS NULL OR length(trim(cancel_reason)) BETWEEN 1 AND 2000)
) STRICT;

INSERT INTO invoices_new (id, business_id, claim_id, kind, claim_value_pence, fee_pence, invoice_status, payment_status,
  vat_position, created_at, entity_type, tax_rate, pool_split_main_pence, pool_split_special_pence, period_start)
SELECT id, business_id, NULL, 'FEE', claim_value_pence, fee_pence, invoice_status, payment_status,
  vat_position, created_at, entity_type, tax_rate, pool_split_main_pence, pool_split_special_pence, period_start
FROM invoices;

DROP TABLE invoices;
ALTER TABLE invoices_new RENAME TO invoices;

CREATE INDEX invoices_business_idx ON invoices(business_id);
CREATE INDEX invoices_claim_idx ON invoices(claim_id, kind, invoice_status);
CREATE INDEX invoices_date_idx ON invoices(invoice_date);


-- ---------------------------------------------------------------------------
-- 5 · CREDIT NOTES — their own rows against the invoice, never an edit to it
--
-- TWO BASES, AND NEITHER TAKES A TYPED AMOUNT. CREDIT_IN_FULL credits what is
-- left uncredited, with a reason. CLAUSE_13_REDUCTION credits the difference
-- between the fee raised and the fee on the corrected figure — and it is refused
-- while clause 13 is switched off (CRM 6 of 10's FEE_CLAWBACK) or blank.
-- A credit note is numbered in the same series as the invoices. Append-only.
-- ---------------------------------------------------------------------------
CREATE TABLE invoice_credit_notes (
  id                          TEXT PRIMARY KEY,
  invoice_id                  TEXT NOT NULL REFERENCES invoices(id),
  basis                       TEXT NOT NULL CHECK (basis IN ('CREDIT_IN_FULL','CLAUSE_13_REDUCTION')),
  amount_pence                INTEGER NOT NULL CHECK (amount_pence > 0),
  vat_pence                   INTEGER NOT NULL CHECK (vat_pence >= 0),
  corrected_claim_value_pence INTEGER CHECK (corrected_claim_value_pence IS NULL OR corrected_claim_value_pence >= 0),
  issued_on                   TEXT NOT NULL CHECK (issued_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  reason                      TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 2000),
  recorded_by                 TEXT NOT NULL REFERENCES users(id),
  recorded_at                 TEXT NOT NULL,
  CHECK ((basis = 'CLAUSE_13_REDUCTION') = (corrected_claim_value_pence IS NOT NULL))
) STRICT;

CREATE INDEX invoice_credit_notes_invoice_idx ON invoice_credit_notes(invoice_id);

CREATE TRIGGER invoice_credit_notes_no_update BEFORE UPDATE ON invoice_credit_notes
BEGIN SELECT RAISE(ABORT, 'a credit note is never changed: a further correction is a further credit note'); END;

CREATE TRIGGER invoice_credit_notes_no_delete BEFORE DELETE ON invoice_credit_notes
BEGIN SELECT RAISE(ABORT, 'a credit note is never deleted'); END;

CREATE TRIGGER invoice_credit_notes_on_a_raised_claim_invoice BEFORE INSERT ON invoice_credit_notes
WHEN NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = NEW.invoice_id AND i.claim_id IS NOT NULL
                   AND i.invoice_status IN ('RAISED','SENT'))
BEGIN SELECT RAISE(ABORT, 'a credit note is against a claim''s raised invoice — a cancelled invoice has nothing to credit'); END;

CREATE TRIGGER invoice_credit_notes_never_more_than_raised BEFORE INSERT ON invoice_credit_notes
WHEN NEW.amount_pence + COALESCE((SELECT SUM(c.amount_pence) FROM invoice_credit_notes c WHERE c.invoice_id = NEW.invoice_id), 0)
       > (SELECT i.fee_pence FROM invoices i WHERE i.id = NEW.invoice_id)
  OR NEW.vat_pence + COALESCE((SELECT SUM(c.vat_pence) FROM invoice_credit_notes c WHERE c.invoice_id = NEW.invoice_id), 0)
       > (SELECT i.vat_pence FROM invoices i WHERE i.id = NEW.invoice_id)
BEGIN SELECT RAISE(ABORT, 'E_CREDIT_EXCEEDS_INVOICE: the credit notes on an invoice never add up to more than it raised'); END;


-- ---------------------------------------------------------------------------
-- 6 · THE NUMBER SERIES — GAPLESS, NEVER REUSED, A CANCELLED NUMBER RECORDED
--
-- One series for invoices and credit notes. The next number is exactly one more
-- than the last, by trigger; a number is never deleted; the only change a number
-- ever takes is to be recorded as CANCELLED — an invoice raised and cancelled
-- before it was sent — and a cancelled number stays in the series, unused.
-- ---------------------------------------------------------------------------
CREATE TABLE invoice_numbers (
  seq            INTEGER PRIMARY KEY CHECK (seq > 0),
  kind           TEXT NOT NULL CHECK (kind IN ('INVOICE','CREDIT_NOTE')),
  invoice_id     TEXT NOT NULL REFERENCES invoices(id),
  credit_note_id TEXT REFERENCES invoice_credit_notes(id),
  state          TEXT NOT NULL CHECK (state IN ('ISSUED','CANCELLED')),
  issued_at      TEXT NOT NULL,
  issued_by      TEXT NOT NULL REFERENCES users(id),
  cancelled_at   TEXT,
  cancelled_by   TEXT REFERENCES users(id),
  CHECK ((kind = 'CREDIT_NOTE') = (credit_note_id IS NOT NULL)),
  CHECK ((state = 'CANCELLED') = (cancelled_at IS NOT NULL)),
  CHECK ((cancelled_at IS NULL) = (cancelled_by IS NULL)),
  CHECK (kind = 'INVOICE' OR state = 'ISSUED')
) STRICT;

CREATE UNIQUE INDEX invoice_numbers_one_per_invoice_uq ON invoice_numbers(invoice_id) WHERE kind = 'INVOICE';
CREATE UNIQUE INDEX invoice_numbers_one_per_credit_note_uq ON invoice_numbers(credit_note_id) WHERE credit_note_id IS NOT NULL;

CREATE TRIGGER invoice_numbers_gapless BEFORE INSERT ON invoice_numbers
WHEN NEW.seq IS NULL OR NEW.seq <> (SELECT COALESCE(MAX(n.seq), 0) + 1 FROM invoice_numbers n)
BEGIN SELECT RAISE(ABORT, 'E_NUMBER_GAP: the next number is one more than the last — never skipped, never reused'); END;

CREATE TRIGGER invoice_numbers_for_a_claim_invoice BEFORE INSERT ON invoice_numbers
WHEN NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = NEW.invoice_id AND i.claim_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'a number is issued to a claim''s invoice or credit note'); END;

CREATE TRIGGER invoice_numbers_no_delete BEFORE DELETE ON invoice_numbers
BEGIN SELECT RAISE(ABORT, 'E_NUMBER_GAP: a number is never deleted — a cancelled one is recorded as cancelled'); END;

CREATE TRIGGER invoice_numbers_only_cancelled BEFORE UPDATE ON invoice_numbers
WHEN OLD.state = 'CANCELLED' OR NEW.state <> 'CANCELLED'
  OR NEW.seq IS NOT OLD.seq OR NEW.kind IS NOT OLD.kind OR NEW.invoice_id IS NOT OLD.invoice_id
  OR NEW.credit_note_id IS NOT OLD.credit_note_id OR NEW.issued_at IS NOT OLD.issued_at OR NEW.issued_by IS NOT OLD.issued_by
BEGIN SELECT RAISE(ABORT, 'a number keeps its record: the only change it takes is to be recorded as cancelled, once'); END;


-- ---------------------------------------------------------------------------
-- 7 · MONEY RECEIVED — RECORDED, NOT COLLECTED
--
-- A person who has seen the bank records what arrived: the day, the amount, the
-- method — bank transfer, the only one there is — who recorded it, and whether
-- the client confirmed our bank details on a channel other than email.
-- `bank_details_confirmed` IS NULLABLE: never asked is NULL, and it reads exactly
-- as NOT_KNOWN does — neither is a confirmation (N4).
-- Nothing tells the system a transfer arrived. A mistaken record is VOIDED once,
-- with a reason, and never deleted or edited.
-- ---------------------------------------------------------------------------
CREATE TABLE invoice_payments (
  id                     TEXT PRIMARY KEY,
  invoice_id             TEXT NOT NULL REFERENCES invoices(id),
  received_on            TEXT NOT NULL CHECK (received_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  amount_pence           INTEGER NOT NULL CHECK (amount_pence > 0),
  method                 TEXT NOT NULL CHECK (method = 'BANK_TRANSFER'),
  bank_details_confirmed TEXT CHECK (bank_details_confirmed IN ('OTHER_CHANNEL','NOT_CONFIRMED','NOT_KNOWN')),
  recorded_by            TEXT NOT NULL REFERENCES users(id),
  recorded_at            TEXT NOT NULL,
  voided_at              TEXT,
  voided_by              TEXT REFERENCES users(id),
  void_reason            TEXT,
  CHECK ((voided_at IS NULL) = (voided_by IS NULL)),
  CHECK ((voided_at IS NULL) = (void_reason IS NULL)),
  CHECK (void_reason IS NULL OR length(trim(void_reason)) BETWEEN 1 AND 2000)
) STRICT;

CREATE INDEX invoice_payments_invoice_idx ON invoice_payments(invoice_id);
CREATE INDEX invoice_payments_received_idx ON invoice_payments(received_on);

CREATE TRIGGER invoice_payments_no_delete BEFORE DELETE ON invoice_payments
BEGIN SELECT RAISE(ABORT, 'money recorded as received is never deleted — a mistaken record is voided, with a reason'); END;

CREATE TRIGGER invoice_payments_only_voided BEFORE UPDATE ON invoice_payments
WHEN OLD.voided_at IS NOT NULL OR NEW.voided_at IS NULL
  OR NEW.id IS NOT OLD.id OR NEW.invoice_id IS NOT OLD.invoice_id OR NEW.received_on IS NOT OLD.received_on
  OR NEW.amount_pence IS NOT OLD.amount_pence OR NEW.method IS NOT OLD.method
  OR NEW.bank_details_confirmed IS NOT OLD.bank_details_confirmed
  OR NEW.recorded_by IS NOT OLD.recorded_by OR NEW.recorded_at IS NOT OLD.recorded_at
BEGIN SELECT RAISE(ABORT, 'money recorded as received keeps its record: the only change it takes is to be voided once, with a reason'); END;

CREATE TRIGGER invoice_payments_on_a_raised_claim_invoice BEFORE INSERT ON invoice_payments
WHEN NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = NEW.invoice_id AND i.claim_id IS NOT NULL
                   AND i.invoice_status IN ('RAISED','SENT'))
BEGIN SELECT RAISE(ABORT, 'money is recorded against a claim''s raised invoice — never a cancelled one'); END;

CREATE TRIGGER invoice_payments_never_more_than_owed BEFORE INSERT ON invoice_payments
WHEN NEW.amount_pence
     + COALESCE((SELECT SUM(p.amount_pence) FROM invoice_payments p WHERE p.invoice_id = NEW.invoice_id AND p.voided_at IS NULL), 0)
   > (SELECT i.fee_pence + i.vat_pence FROM invoices i WHERE i.id = NEW.invoice_id)
     - COALESCE((SELECT SUM(c.amount_pence + c.vat_pence) FROM invoice_credit_notes c WHERE c.invoice_id = NEW.invoice_id), 0)
BEGIN SELECT RAISE(ABORT, 'E_MORE_THAN_OWED: money recorded against an invoice never adds up to more than it still asks for'); END;


-- ---------------------------------------------------------------------------
-- 8 · THE TRIGGERS ON INVOICES — written after the tables they read
-- ---------------------------------------------------------------------------
CREATE TRIGGER invoices_claim_invoice_amounts_fixed BEFORE UPDATE OF
  business_id, claim_id, kind, claim_value_pence, fee_pence, fee_rate, vat_position, vat_setting_id, vat_pence,
  invoice_date, due_on, due_basis, fee_basis, fee_warning, raised_by, created_at,
  entity_type, tax_rate, pool_split_main_pence, pool_split_special_pence, period_start, payment_status ON invoices
WHEN OLD.claim_id IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'E_INVOICE_AMOUNT_FIXED: a raised invoice keeps its amount, its VAT, its date and its terms — a credit note is the only way a raised amount changes'); END;

CREATE TRIGGER invoices_organisation_invoice_stays_on_the_organisation BEFORE UPDATE OF claim_id ON invoices
WHEN OLD.claim_id IS NULL AND NEW.claim_id IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'an organisation''s invoice from before CRM 7 of 10 is not moved onto a claim: which claim it was for was never recorded'); END;

CREATE TRIGGER invoices_claim_invoice_state_forward BEFORE UPDATE OF invoice_status ON invoices
WHEN OLD.claim_id IS NOT NULL AND NEW.invoice_status IS NOT OLD.invoice_status
 AND NOT (OLD.invoice_status = 'RAISED' AND NEW.invoice_status IN ('SENT','CANCELLED'))
BEGIN SELECT RAISE(ABORT, 'a raised invoice is sent or cancelled; a sent invoice is changed only by a credit note, and a cancelled one stays cancelled'); END;

CREATE TRIGGER invoices_claim_invoice_cancelled_only_when_clean BEFORE UPDATE OF invoice_status ON invoices
WHEN OLD.claim_id IS NOT NULL AND NEW.invoice_status = 'CANCELLED' AND OLD.invoice_status <> 'CANCELLED'
 AND (EXISTS (SELECT 1 FROM invoice_payments p WHERE p.invoice_id = OLD.id AND p.voided_at IS NULL)
      OR EXISTS (SELECT 1 FROM invoice_credit_notes c WHERE c.invoice_id = OLD.id))
BEGIN SELECT RAISE(ABORT, 'an invoice with money recorded against it, or a credit note, is not cancelled — it is credited'); END;

CREATE TRIGGER invoices_claim_invoice_never_deleted BEFORE DELETE ON invoices
WHEN OLD.claim_id IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'a claim''s invoice is never deleted — it is cancelled before it is sent, or credited after'); END;

CREATE TRIGGER invoices_vat_from_the_recorded_position BEFORE INSERT ON invoices
WHEN NEW.claim_id IS NOT NULL AND (
  NOT EXISTS (SELECT 1 FROM finance_settings s WHERE s.id = NEW.vat_setting_id AND s.setting = 'VAT_POSITION')
  OR (NEW.vat_pence <> 0 AND EXISTS (SELECT 1 FROM finance_settings s WHERE s.id = NEW.vat_setting_id AND s.value = 'NOT_REGISTERED')))
BEGIN SELECT RAISE(ABORT, 'E_VAT_NOT_FROM_THE_POSITION: an invoice''s VAT is read from the recorded VAT position — and none is charged while Caprebate is not registered'); END;


-- ---------------------------------------------------------------------------
-- 9 · STAFF TASKS, REBUILT — A TASK ABOUT CAPREBATE ITSELF
--
-- The VAT threshold is nobody's organisation, lead or firm. `company_subject`
-- names what such a task is about — the VAT threshold and nothing else yet — and
-- a task carrying one is about nothing beside it. It waits with ACCOUNTING like
-- the invoice stage's finance task, is written through `insertTask` in
-- src/web/tasks.ts, is flagged overdue by `dueReading` like every task, and at
-- most one is open per subject at a time. Its origin is VAT_MONITOR, and only
-- such a task has that origin.
--
-- Every other column, CHECK, index and trigger is character for character 014's.
-- ---------------------------------------------------------------------------
CREATE TABLE staff_tasks_new (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 300),
  description       TEXT,
  owner_id          TEXT REFERENCES users(id),
  -- The team a task waits with while nobody has taken it. Never CLIENT.
  owner_role        TEXT CHECK (owner_role IN ('ADMIN','SALES','ACCOUNTING','SURVEYING')),
  due_on            TEXT CHECK (due_on IS NULL OR due_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  priority          TEXT,
  status            TEXT NOT NULL CHECK (status IN ('OPEN','IN_PROGRESS','COMPLETED','CANCELLED')),
  activity_type     TEXT NOT NULL,
  business_id       TEXT REFERENCES businesses(id),
  property_id       TEXT,
  claim_id          TEXT,
  lead_id           TEXT REFERENCES leads(id),
  contact_id        TEXT REFERENCES contacts(id),
  -- The missing fact an information-request task asks for — the id
  -- `missingFacts` in src/web/engaged.ts gives it — so the list is derived.
  fact_id           TEXT,
  recurrence        TEXT CHECK (recurrence IN ('WEEKLY','FORTNIGHTLY','MONTHLY','QUARTERLY')),
  recurred_from_id  TEXT REFERENCES staff_tasks(id),
  is_next_action    INTEGER NOT NULL DEFAULT 0 CHECK (is_next_action IN (0,1)),
  origin            TEXT NOT NULL CHECK (origin IN ('STAFF','AUTOMATION','RECURRENCE','MIGRATION','VAT_MONITOR')),
  automation_run_id TEXT REFERENCES automation_runs(id),
  created_by        TEXT REFERENCES users(id),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  started_at        TEXT,
  completed_at      TEXT,
  completed_by      TEXT REFERENCES users(id),
  cancelled_at      TEXT,
  cancelled_by      TEXT REFERENCES users(id),
  cancel_reason     TEXT,
  -- CRM 5 of 10: an introducing firm, and then nothing else.
  introducer_id     TEXT REFERENCES introducers(id),
  -- CRM 7 of 10: Caprebate itself — the VAT threshold — and then nothing else.
  company_subject   TEXT CHECK (company_subject IN ('VAT_THRESHOLD')),
  FOREIGN KEY (property_id, business_id) REFERENCES properties(id, business_id),
  FOREIGN KEY (claim_id, business_id) REFERENCES claims(id, business_id),
  CHECK (business_id IS NOT NULL OR lead_id IS NOT NULL OR introducer_id IS NOT NULL OR company_subject IS NOT NULL),
  CHECK (introducer_id IS NULL OR (business_id IS NULL AND lead_id IS NULL AND property_id IS NULL AND claim_id IS NULL)),
  CHECK (company_subject IS NULL OR (business_id IS NULL AND lead_id IS NULL AND property_id IS NULL AND claim_id IS NULL
                                     AND introducer_id IS NULL AND contact_id IS NULL AND is_next_action = 0)),
  CHECK ((origin = 'VAT_MONITOR') = (company_subject IS NOT NULL)),
  CHECK (property_id IS NULL OR business_id IS NOT NULL),
  CHECK (claim_id IS NULL OR business_id IS NOT NULL),
  CHECK (is_next_action = 0 OR claim_id IS NOT NULL),
  CHECK (status <> 'COMPLETED' OR (completed_at IS NOT NULL AND completed_by IS NOT NULL)),
  CHECK (status = 'COMPLETED' OR (completed_at IS NULL AND completed_by IS NULL)),
  CHECK (status <> 'CANCELLED' OR (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL
                                   AND cancel_reason IS NOT NULL AND length(trim(cancel_reason)) > 0)),
  CHECK (status = 'CANCELLED' OR (cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL)),
  CHECK (origin <> 'STAFF' OR created_by IS NOT NULL),
  CHECK (origin <> 'AUTOMATION' OR automation_run_id IS NOT NULL),
  CHECK (origin <> 'RECURRENCE' OR recurred_from_id IS NOT NULL)
) STRICT;

INSERT INTO staff_tasks_new (id, title, description, owner_id, owner_role, due_on, priority, status, activity_type,
  business_id, property_id, claim_id, lead_id, contact_id, fact_id, recurrence, recurred_from_id, is_next_action, origin,
  automation_run_id, created_by, created_at, updated_at, started_at, completed_at, completed_by, cancelled_at, cancelled_by,
  cancel_reason, introducer_id, company_subject)
SELECT id, title, description, owner_id, owner_role, due_on, priority, status, activity_type,
  business_id, property_id, claim_id, lead_id, contact_id, fact_id, recurrence, recurred_from_id, is_next_action, origin,
  automation_run_id, created_by, created_at, updated_at, started_at, completed_at, completed_by, cancelled_at, cancelled_by,
  cancel_reason, introducer_id, NULL
FROM staff_tasks;

DROP TABLE staff_tasks;
ALTER TABLE staff_tasks_new RENAME TO staff_tasks;

CREATE INDEX staff_tasks_owner_idx ON staff_tasks(owner_id, status, due_on);
CREATE INDEX staff_tasks_role_idx ON staff_tasks(owner_role, status, due_on);
CREATE INDEX staff_tasks_business_idx ON staff_tasks(business_id);
CREATE INDEX staff_tasks_claim_idx ON staff_tasks(claim_id);
CREATE INDEX staff_tasks_lead_idx ON staff_tasks(lead_id);
CREATE INDEX staff_tasks_contact_idx ON staff_tasks(contact_id);
CREATE INDEX staff_tasks_introducer_idx ON staff_tasks(introducer_id, status, due_on);
CREATE UNIQUE INDEX staff_tasks_one_next_action_uq ON staff_tasks(claim_id)
  WHERE is_next_action = 1 AND status IN ('OPEN','IN_PROGRESS');
CREATE UNIQUE INDEX staff_tasks_one_successor_uq ON staff_tasks(recurred_from_id)
  WHERE recurred_from_id IS NOT NULL;
-- CRM 7 of 10: at most one open task per company subject.
CREATE UNIQUE INDEX staff_tasks_one_open_company_task_uq ON staff_tasks(company_subject)
  WHERE company_subject IS NOT NULL AND status IN ('OPEN','IN_PROGRESS');

CREATE TRIGGER staff_tasks_never_deleted BEFORE DELETE ON staff_tasks
BEGIN SELECT RAISE(ABORT, 'a staff task is cancelled, with a reason, never deleted'); END;

CREATE TRIGGER staff_tasks_closed_is_final BEFORE UPDATE ON staff_tasks
WHEN OLD.status IN ('COMPLETED','CANCELLED')
BEGIN SELECT RAISE(ABORT, 'a completed or cancelled task keeps its record: nothing about it changes'); END;

-- The activity types and priorities are lists CRM 9 of 10's settings make
-- configurable, so they are named trigger pairs and not CHECKs (row E2's idiom).
-- CRM 5 of 10 adds the three reciprocity kinds of reward model A.
CREATE TRIGGER staff_tasks_vocabulary_insert BEFORE INSERT ON staff_tasks
WHEN NEW.activity_type NOT IN ('CALL','EMAIL','MEETING','NOTE','TASK','SURVEY','DOCUMENT_REQUEST','REVIEW','OTHER',
                               'CPD_SESSION','CO_BRANDED_ONE_PAGER','PRIORITY_TURNAROUND')
  OR (NEW.priority IS NOT NULL AND NEW.priority NOT IN ('LOW','NORMAL','HIGH'))
BEGIN SELECT RAISE(ABORT, 'staff_tasks.activity_type or priority is not on the list'); END;

CREATE TRIGGER staff_tasks_vocabulary_update BEFORE UPDATE OF activity_type, priority ON staff_tasks
WHEN NEW.activity_type NOT IN ('CALL','EMAIL','MEETING','NOTE','TASK','SURVEY','DOCUMENT_REQUEST','REVIEW','OTHER',
                               'CPD_SESSION','CO_BRANDED_ONE_PAGER','PRIORITY_TURNAROUND')
  OR (NEW.priority IS NOT NULL AND NEW.priority NOT IN ('LOW','NORMAL','HIGH'))
BEGIN SELECT RAISE(ABORT, 'staff_tasks.activity_type or priority is not on the list'); END;

-- A LEAD'S TASK BELONGS TO THE LEAD'S OWN ORGANISATION, once it has one.
CREATE TRIGGER staff_tasks_lead_same_organisation_insert BEFORE INSERT ON staff_tasks
WHEN NEW.lead_id IS NOT NULL AND NEW.business_id IS NOT NULL
 AND EXISTS (SELECT 1 FROM leads l WHERE l.id = NEW.lead_id AND l.business_id IS NOT NULL AND l.business_id <> NEW.business_id)
BEGIN SELECT RAISE(ABORT, 'a lead''s task belongs to the lead''s own organisation'); END;

CREATE TRIGGER staff_tasks_lead_same_organisation_update BEFORE UPDATE OF business_id, lead_id ON staff_tasks
WHEN NEW.lead_id IS NOT NULL AND NEW.business_id IS NOT NULL
 AND EXISTS (SELECT 1 FROM leads l WHERE l.id = NEW.lead_id AND l.business_id IS NOT NULL AND l.business_id <> NEW.business_id)
BEGIN SELECT RAISE(ABORT, 'a lead''s task belongs to the lead''s own organisation'); END;

-- A CONTACT NAMED ON A TASK IS ONE OF THE TASK'S OWN ORGANISATION, LEAD OR FIRM.
CREATE TRIGGER staff_tasks_contact_belongs_insert BEFORE INSERT ON staff_tasks
WHEN NEW.contact_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM contacts c WHERE c.id = NEW.contact_id
     AND ((NEW.business_id IS NOT NULL AND c.business_id = NEW.business_id)
       OR (NEW.lead_id IS NOT NULL AND c.lead_id = NEW.lead_id)
       OR (NEW.introducer_id IS NOT NULL AND c.introducer_id = NEW.introducer_id)))
BEGIN SELECT RAISE(ABORT, 'a task''s contact must be one of its own organisation''s, lead''s or firm''s'); END;

CREATE TRIGGER staff_tasks_contact_belongs_update BEFORE UPDATE OF contact_id, business_id, lead_id, introducer_id ON staff_tasks
WHEN NEW.contact_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM contacts c WHERE c.id = NEW.contact_id
     AND ((NEW.business_id IS NOT NULL AND c.business_id = NEW.business_id)
       OR (NEW.lead_id IS NOT NULL AND c.lead_id = NEW.lead_id)
       OR (NEW.introducer_id IS NOT NULL AND c.introducer_id = NEW.introducer_id)))
BEGIN SELECT RAISE(ABORT, 'a task''s contact must be one of its own organisation''s, lead''s or firm''s'); END;

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


-- ---------------------------------------------------------------------------
-- 10 · THE INVOICE EMAIL, REFUSED AT THE TABLE — WIDENED, NOT DUPLICATED
--
-- Migration 012's named trigger pair refused a template carrying an invoice, a
-- remittance or bank details. CRM 7 of 10 replaces the pair with the same name
-- and the same message, and widens what it refuses to everything an invoice
-- email or a chasing email would carry: payment details, where to pay, a bank
-- transfer, an amount due, a fee note and a statement of account. The store's
-- `templateRefusal` in src/web/templates.ts refuses the same words, and again at
-- the merge. There is no third place.
-- ---------------------------------------------------------------------------
DROP TRIGGER email_templates_no_invoice_or_bank_insert;
DROP TRIGGER email_templates_no_invoice_or_bank_update;

CREATE TRIGGER email_templates_no_invoice_or_bank_insert BEFORE INSERT ON email_templates
WHEN (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%invoice%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%remit%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%sort code%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%account number%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%bank detail%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%bank account%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%iban%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%payment detail%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%bank transfer%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%pay to%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%pay into%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%amount due%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%amount outstanding%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%fee note%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%statement of account%'
BEGIN SELECT RAISE(ABORT, 'E_TEMPLATE_REFUSED: a template may not carry bank details or an invoice'); END;

CREATE TRIGGER email_templates_no_invoice_or_bank_update BEFORE UPDATE OF label, subject, body ON email_templates
WHEN (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%invoice%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%remit%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%sort code%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%account number%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%bank detail%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%bank account%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%iban%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%payment detail%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%bank transfer%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%pay to%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%pay into%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%amount due%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%amount outstanding%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%fee note%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%statement of account%'
BEGIN SELECT RAISE(ABORT, 'E_TEMPLATE_REFUSED: a template may not carry bank details or an invoice'); END;


-- 11 · THE GUARD. Zero violations, or this migration does not happen at all.
CREATE TABLE _fk_check_guard (ok INTEGER NOT NULL CHECK (ok = 0)) STRICT;
INSERT INTO _fk_check_guard (ok) SELECT count(*) FROM pragma_foreign_key_check;
DROP TABLE _fk_check_guard;

-- 12 · commit.
COMMIT;

-- 13 · and back on.
PRAGMA foreign_keys = ON;
