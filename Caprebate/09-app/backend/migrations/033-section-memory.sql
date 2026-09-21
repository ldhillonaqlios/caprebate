-- ===========================================================================
-- 033 — WHICH SECTIONS A PERSON KEEPS OPEN.     Phase 138, 21 September 2026
--
-- WHY. The client page and the claim page are now coloured sections that open
-- and close (src/web/components.ts, `section`). A Done section starts closed and
-- the section being worked on starts open. A person may say "keep this open for
-- me" or "keep this closed for me"; the page remembers it for that person, on
-- any device. It is kept here, on the server, because it must never be in the
-- address and the pages run no script.
--
-- WHAT THIS IS. One row per person per section they have chosen for. `section`
-- is one of the fixed keys in src/web/sections.ts (SECTION_KEYS), which refuses
-- any other before it reaches this table. "Let the page decide" deletes the row.
-- A display preference only: it changes nothing a person may see or do.
-- ===========================================================================

CREATE TABLE section_prefs (
  user_id     TEXT NOT NULL REFERENCES users(id),
  section     TEXT NOT NULL CHECK (length(section) BETWEEN 1 AND 40),
  open        INTEGER NOT NULL CHECK (open IN (0, 1)),
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, section)
);
