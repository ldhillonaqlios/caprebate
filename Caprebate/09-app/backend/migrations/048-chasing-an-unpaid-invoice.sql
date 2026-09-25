-- ===========================================================================
-- 048 — CHASING AN UNPAID INVOICE.                                     Phase 151b, 25 September 2026
--
-- Lakhbir, Word answer 40 (closed 24 September 2026): the Accounting team should "get notified to raise the invoice
-- and chase, and also update once payment has been received". Two of the three already existed — the invoice-stage
-- task for Accounting (migration 012, rule-invoice-finance-task) and recording money received (migration 016). The
-- chase had nowhere to go. This is it.
--
-- ONE ROW PER CHASE, BY A PERSON. The day, how (a call, an email, a letter, in person) and a short note. NOTHING HERE
-- SENDS ANYTHING: no rule may chase an invoice by email while the invoice-fraud procedure is unwritten
-- (src/web/automation.ts, INVOICE_REMINDER), so a chase is something Accounting did and records, not something the
-- system does. Who chased, and when it was recorded, are the row's own; the audit log's INVOICE_CHASED keeps the
-- invoice, the day and how — never the note.
--
-- APPEND-ONLY. A chase happened or it did not; a wrong one is followed by a correct one, never edited away.
-- ===========================================================================

CREATE TABLE invoice_chases (
  id           TEXT PRIMARY KEY,
  invoice_id   TEXT NOT NULL REFERENCES invoices(id),
  chased_on    TEXT NOT NULL CHECK (chased_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  how          TEXT NOT NULL CHECK (how IN ('PHONE','EMAIL','LETTER','IN_PERSON')),
  note         TEXT CHECK (note IS NULL OR length(trim(note)) BETWEEN 1 AND 500),
  chased_by    TEXT NOT NULL REFERENCES users(id),
  recorded_at  TEXT NOT NULL
) STRICT;

CREATE INDEX invoice_chases_by_invoice ON invoice_chases (invoice_id, chased_on);

CREATE TRIGGER invoice_chases_no_update BEFORE UPDATE ON invoice_chases
BEGIN SELECT RAISE(ABORT, 'a chase is recorded once: record another, never change this one'); END;

CREATE TRIGGER invoice_chases_no_delete BEFORE DELETE ON invoice_chases
BEGIN SELECT RAISE(ABORT, 'a chase is kept with the invoice'); END;
