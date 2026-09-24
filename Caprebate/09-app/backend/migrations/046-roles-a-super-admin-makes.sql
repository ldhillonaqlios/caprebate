-- ===========================================================================
-- 046 — ROLES A SUPER ADMIN CAN MAKE.                         Phase 151, 24 September 2026
--
-- Lakhbir, Word answers 39 and 40 (closed 24 September 2026): the super admin must be able to create roles, choose
-- what each can see and do, and give people roles. src/custom-roles.ts is the design and its hard limits;
-- src/web/role-editor.ts makes, changes and retires a role, every step in the audit log.
--
-- A MADE ROLE IS A ROW IN `roles` TOO, keyed "ROLE_<NAME>", so users.role's own reference (migration 001) holds a user
-- to a role that exists. Its grants are here: one row per action, naming the built-in staff role whose rule it
-- borrows. A grant can only name one of the four staff roles; the table refuses a client's rule outright.
--
-- RETIRED, NOT DELETED. A role anybody ever held is kept, so the audit log's rows about it still name something. A
-- role still held by a user cannot be retired (src/web/role-editor.ts refuses it in words first).
-- ===========================================================================

-- THE ROLES TABLE STOPS BEING FIXED FOR MADE ROLES ONLY. Migrations 019 and 026 refused every new row, because a new
-- role was a question for Lakhbir. He has answered it. The trigger is rebuilt to admit ONLY a made role's key
-- ("ROLE_" and capitals), and only while no user yet holds it; a built-in name, or anything else, is still refused. The
-- update and delete triggers stay as they are: a role row is never changed or deleted — a made role is RETIRED below.
DROP TRIGGER roles_fixed_insert;

CREATE TRIGGER roles_fixed_insert BEFORE INSERT ON roles
WHEN NEW.role NOT GLOB 'ROLE_[A-Z0-9]*'
BEGIN SELECT RAISE(ABORT, 'the six built-in roles are fixed: a new role is one the super admin makes, named ROLE_...'); END;

CREATE TABLE custom_roles (
  role        TEXT PRIMARY KEY REFERENCES roles(role) CHECK (role GLOB 'ROLE_[A-Z0-9]*' AND length(role) <= 70),
  name        TEXT NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 60),
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  retired_at  TEXT
) STRICT;

CREATE TABLE custom_role_grants (
  role     TEXT NOT NULL REFERENCES custom_roles(role),
  action   TEXT NOT NULL CHECK (length(action) BETWEEN 3 AND 80),
  as_role  TEXT NOT NULL CHECK (as_role IN ('ADMIN','SALES','ACCOUNTING','SURVEYING')),
  PRIMARY KEY (role, action)
) STRICT;

CREATE TRIGGER custom_roles_no_delete BEFORE DELETE ON custom_roles
BEGIN SELECT RAISE(ABORT, 'a role is retired, never deleted'); END;
