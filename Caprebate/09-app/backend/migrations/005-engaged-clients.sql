-- ===========================================================================
-- 005 — engaged clients, the business page, and the research button.
--                                                       Phase 106, 9 Sep 2026
--
-- Migration 002 already created `research_sources`, `engagements`,
-- `internal_notes` and `register_records`, and 003 created `client_tasks`.
-- THIS MIGRATION ADDS ALMOST NOTHING NEW. What it does is make three things
-- RECORDABLE that the existing tables could only imply:
--
--   1. PROVENANCE ON A FIRED SOURCE. The phase brief: "Every fired source
--      records publisher, licence and retrieval timestamp —
--      caprebate-source-register.ts already defines that shape. Follow it."
--      That module separates `retrieved_at` (when the publisher's value was
--      read) from `recorded_at` (when we wrote it), and 002 had only one
--      column, `fired_at`, which is the second of those. Both are added.
--
--   2. THE BUTTON'S OWN LEDGER. "Run the research" is the one control in this
--      system that could cost real money, so the brief says to rate-limit it.
--      A rate limit needs a count that survives a restart, and the count is
--      worth keeping anyway: who ran the research, when, and what happened.
--
--   3. WHICH ROUTE CLEARED A TASK, AND WHETHER THE CLIENT EVER SAW IT.
--      003 gave `client_tasks` an `answered_by_role` of CLIENT or STAFF, which
--      is the provenance distinction this whole system rests on. What it could
--      not express is the difference between a question the client was SENT
--      and declined to answer, and a question that was never put to them
--      because somebody rang instead. Those are different facts about how a
--      claim file was assembled, and `sent_to_portal_at` is the one that tells
--      them apart.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · RESEARCH SOURCES GAIN THE PROVENANCE SHAPE
--
-- PUBLISHER AND LICENCE ARE COPIED, NOT JOINED, AND THAT IS DELIBERATE.
-- caprebate-source-register.ts is the authority and the application reads the
-- catalogue from it — but provenance is a statement about what was true AT THE
-- MOMENT OF RETRIEVAL. A licence can be renegotiated and a dataset can change
-- hands; a fired row that resolved its publisher by lookup would silently
-- restate history every time the register was edited. The register says the
-- same thing about its own cells: provenance is attached to the value, not
-- kept in a table alongside it.
--
-- `attempts` IS NOT A RATE LIMIT. It is how many times this particular source
-- has been tried, which is what makes a retry-after-failure honest about being
-- the second or the fifth attempt. The rate limit is on the button, below.
-- ---------------------------------------------------------------------------
ALTER TABLE research_sources ADD COLUMN publisher TEXT;
ALTER TABLE research_sources ADD COLUMN licence_id TEXT;
ALTER TABLE research_sources ADD COLUMN retrieved_at TEXT;
ALTER TABLE research_sources ADD COLUMN failure_code TEXT;
ALTER TABLE research_sources ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 2 · THE RESEARCH RUN — one row per operator click.
--
-- THE OPERATOR PICKS THE MOMENT, NOT THE CALLS. That is the 4 September rule,
-- and this table is its record: one row per click, with the counts of what the
-- click reached. There is deliberately NO per-source approval column, because
-- there is deliberately no per-source approval.
--
-- IT IS ALSO THE RATE LIMIT. `rate_limit_hits` from migration 001 counts by an
-- opaque bucket and holds no history; this holds the history and the count is
-- read off it. One table rather than two, because a rate limit and an audit of
-- the same event that disagreed would be worse than either alone.
-- ---------------------------------------------------------------------------
CREATE TABLE research_runs (
  id           TEXT PRIMARY KEY,
  business_id  TEXT NOT NULL REFERENCES businesses(id),
  actor_id     TEXT NOT NULL REFERENCES users(id),
  at           TEXT NOT NULL,
  -- What the click was allowed to reach. `fired` is zero in this build and is
  -- expected to be: the connectors do not exist. A column that could only ever
  -- be zero would be dishonest, so it is written from what actually happened
  -- rather than from what was intended.
  considered   INTEGER NOT NULL,
  fired        INTEGER NOT NULL,
  not_permitted INTEGER NOT NULL,
  failed       INTEGER NOT NULL,
  -- 'RUN' for the button, 'RETRY' for the single-source retry of a FAILED
  -- source — which is the one exception the brief allows, because retrying a
  -- failure is not choosing which sources to consult.
  kind         TEXT NOT NULL CHECK (kind IN ('RUN','RETRY')),
  -- Set for a RETRY only. NULL on a RUN, because a run has no single source.
  source_id    TEXT
) STRICT;

CREATE INDEX research_runs_business_idx ON research_runs(business_id, at);

-- ---------------------------------------------------------------------------
-- 3 · CLIENT TASKS — the fact they clear, and whether the client ever saw them
--
-- `fact_id` BINDS A TASK TO THE MISSING FACT IT WOULD CLEAR. Without it the
-- link between "what is still missing" and "what we have asked" is a staff
-- member reading two lists and matching them by eye, which is exactly the
-- hand-maintained checklist the brief says not to build. With it, a fact that
-- has a task against it can say so, and a task can say which fact it clears.
-- It is nullable because a staff member may also ask something the derivation
-- layer never named, and refusing that would push the conversation off-system.
--
-- `sent_to_portal_at` IS THE RECORD OF THE FIRST ROUTE. A task with a stamp
-- here was put to the client; a task without one was never shown to them. Read
-- with `answered_by_role` it distinguishes all four states that matter:
--   sent + CLIENT   the client answered the question we put to them
--   sent + STAFF    we asked, they did not answer, somebody rang
--   unsent + STAFF  nobody put it to them; a staff member recorded what they
--                   were told, and the file should say so
--   unsent + CLIENT is not reachable, and there is a test that it is not.
-- ---------------------------------------------------------------------------
ALTER TABLE client_tasks ADD COLUMN fact_id TEXT;
ALTER TABLE client_tasks ADD COLUMN sent_to_portal_at TEXT;

CREATE INDEX client_tasks_fact_idx ON client_tasks(business_id, fact_id);
