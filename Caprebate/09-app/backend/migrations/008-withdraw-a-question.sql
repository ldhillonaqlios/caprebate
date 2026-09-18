-- ===========================================================================
-- 008 — a question asked in error can be withdrawn.      Phase 113b, 9 Sep 2026
--
-- `client_tasks.state` has allowed 'WITHDRAWN' since migration 003, and
-- `missingFacts` in src/web/engaged.ts has always handled it correctly: a
-- withdrawn question is "not a task at all", so the fact it was asking about
-- goes back on the missing list rather than being quietly hidden by the
-- withdrawal. There was a test for it. THERE WAS NO CONTROL THAT SET IT, so
-- the state was unreachable outside a hand-written UPDATE, and the test had to
-- write one.
--
-- WHAT THIS MIGRATION ADDS IS THE RECORD, NOT THE STATE. "We asked this and
-- then took it back" is a fact about how the claim file was assembled, in
-- exactly the way `answered_by_role` and `sent_to_portal_at` already are — a
-- question that appeared in a client's portal and then vanished from it needs
-- to be answerable three years later with a name and a date, not with a state
-- that says only that it happened at some point.
--
-- ---------------------------------------------------------------------------
-- WHY A TRIGGER AND NOT A CHECK
--
-- SQLite CANNOT ADD A CHECK TO AN EXISTING TABLE. `ALTER TABLE ... ADD COLUMN`
-- carries a column-level CHECK only for the column being added, and a
-- constraint spanning `state` and `withdrawn_at` is a table CHECK. The
-- documented alternative is the twelve-step table rebuild migration 007 does —
-- which is right when a CHECK has to be REMOVED and is disproportionate here,
-- because `client_tasks` is referenced by nothing and this constraint only has
-- to be added. A trigger states it, enforces it, and says so in its own error.
--
-- MIGRATION 004 ALREADY ESTABLISHED THE IDIOM on `businesses.preferred_contact`
-- and it is used the same way: a trigger can only make a column stricter, and
-- making it stricter is the whole intent.
--
-- IT WAS PROVED ABLE TO FAIL BEFORE IT WAS KEPT. A raw
--   UPDATE client_tasks SET state = 'WITHDRAWN' WHERE id = ?
-- — which is exactly what the existing test in test/engaged.test.ts did before
-- this phase — now raises "a withdrawal must record who withdrew it and when".
-- That test now goes through the route instead, which is what it should have
-- been doing.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
--
-- IT DOES NOT MAKE 'ANSWERED' -> 'WITHDRAWN' IMPOSSIBLE IN THE SCHEMA, and the
-- refusal that matters lives in `withdrawTask`, which reads the row and refuses
-- against the record. Two reasons. A trigger blocking that transition would
-- raise a SQLite error where the application owes the operator a sentence
-- explaining that withdrawing an answered question would delete a fact the
-- client gave. And the row is read anyway, to check it belongs to this
-- business — a question of another client's is "not found" and is not named,
-- which is an authorisation decision and not one SQL can take.
-- ===========================================================================

-- 1 · WHO, AND WHEN. Nullable because every existing row predates the control
--     and no value could be invented for them; the trigger below is what makes
--     them non-negotiable from here on.
ALTER TABLE client_tasks ADD COLUMN withdrawn_at TEXT;
ALTER TABLE client_tasks ADD COLUMN withdrawn_by TEXT REFERENCES users(id);

-- 2 · THE CONSTRAINT THE ALTER COULD NOT CARRY. A row that arrives at
--     WITHDRAWN without both stamps is refused, whoever wrote it and by
--     whatever route.
CREATE TRIGGER client_tasks_withdrawal_is_recorded
BEFORE UPDATE OF state ON client_tasks
WHEN NEW.state = 'WITHDRAWN'
     AND (NEW.withdrawn_at IS NULL OR NEW.withdrawn_by IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'a withdrawal must record who withdrew it and when');
END;

-- 3 · AND ON INSERT, because a row can be created in any state the CHECK from
--     003 allows. Nothing creates one WITHDRAWN today; the constraint is about
--     the table, not about today's callers.
CREATE TRIGGER client_tasks_withdrawal_is_recorded_on_insert
BEFORE INSERT ON client_tasks
WHEN NEW.state = 'WITHDRAWN'
     AND (NEW.withdrawn_at IS NULL OR NEW.withdrawn_by IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'a withdrawal must record who withdrew it and when');
END;
