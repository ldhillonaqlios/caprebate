-- ===========================================================================
-- 026 — A SIXTH APPLICATION ROLE: READ-ONLY.        Phase 132e, 16 September 2026
--
-- WHY. Lakhbir, answering "Do we need a login for anyone beyond the five roles
-- ...?": "One main log in for admin/manager/owner, and another log for view
-- only". The main login is ADMIN, which already exists. This adds the view-only
-- one. No manager role and no tax-reviewer role is added.
--
-- WHAT IT MAY DO is decided rule by rule in src/authz.ts (READ_ONLY_RULES):
-- an explicit yes or no on every action, never a fall-through to the five-role
-- table. It writes nothing, never reads the sealed estimate, the claim value,
-- the claim's figures, the fee or any money, the compliance registers, the
-- identity store or the audit log, and cannot export a list.
--
-- NOBODY HOLDS IT. No seed user is written with this role; an administrator
-- assigns it when somebody needs it.
-- ===========================================================================

-- Migration 019 fixed the roles table with three triggers: "A sixth role ... is a
-- question for Lakhbir and then a migration — never a row a setting could add."
-- The question is answered, so this is that migration. The insert trigger is
-- dropped for the one row and recreated at once; update and delete stay refused.

DROP TRIGGER roles_fixed_insert;

INSERT INTO roles (role, description) VALUES
  ('READ_ONLY', 'View only. Reads the working record — organisations, contacts, properties, claims without their value, leads without the range, the pipeline, bookings, tasks — and writes nothing. Never the sealed estimate, the claim value or figures, the fee or money, the compliance registers, the identity store or the audit log, and no export.');

CREATE TRIGGER roles_fixed_insert BEFORE INSERT ON roles
BEGIN SELECT RAISE(ABORT, 'the six roles are fixed: a seventh is a question for Lakhbir, not a setting'); END;
