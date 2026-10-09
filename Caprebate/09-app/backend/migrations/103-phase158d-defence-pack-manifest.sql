-- ===========================================================================
-- 103 — THE DEFENCE PACK, MADE FROM THE CLAIM'S OWN RECORDS                 Phase 158d, 9 October 2026
--
-- The second Friary House run (04-phase-work/sim-2026-10-06, finding F47): the defence pack was the last deliverable
-- issued on a SHA-256 staff typed, for a file the application cannot hold. Now issuing it reads the claim's own records
-- (src/web/claim-record.ts `defencePackRecords`): the survey report the surveyor approved, the tax adviser's sign-off,
-- the client report and the accountant's pack as issued, the client's acceptance, our fee invoice as sent, and the
-- filing. Their list is kept here, as issued, and its fingerprint is the deliverable's. Never changed and never deleted.
-- ===========================================================================

CREATE TABLE defence_pack_manifests (
  deliverable_id  TEXT PRIMARY KEY REFERENCES claim_deliverables(id),
  claim_id        TEXT NOT NULL REFERENCES claims(id),
  manifest_json   TEXT NOT NULL CHECK (json_valid(manifest_json)),
  -- The SHA-256 of the manifest as written: 64 lower-case hex characters.
  fingerprint     TEXT NOT NULL CHECK (length(fingerprint) = 64 AND fingerprint NOT GLOB '*[^0-9a-f]*'),
  made_at         TEXT NOT NULL
) STRICT;

CREATE INDEX defence_pack_manifests_claim ON defence_pack_manifests(claim_id, made_at);

CREATE TRIGGER defence_pack_manifests_no_update BEFORE UPDATE ON defence_pack_manifests
BEGIN SELECT RAISE(ABORT, 'a defence pack, once issued, is never changed'); END;

CREATE TRIGGER defence_pack_manifests_no_delete BEFORE DELETE ON defence_pack_manifests
BEGIN SELECT RAISE(ABORT, 'a defence pack is never deleted'); END;
