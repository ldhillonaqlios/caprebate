-- ===========================================================================
-- 020 — THE CLAIM TEAM: AN ORGANISATION'S ACCOUNTANT AND ADVISER, LINKED TO ONE
-- CLAIM.                                     The CRM follow-on, 12 September 2026
--
-- The scope is 09-app/CAPREBATE-CRM-DISPOSITION.md, rows 8.4 and 23.7, and Part R.
-- The code is `claimTeam`, `linkClaimContact` and `unlinkClaimContact` in
-- src/web/crm.ts; the panel is drawn by src/web/crm-pages.ts.
--
-- ONE TABLE, AND IT IS A LINK. A contact is never a user: the row names a
-- contact that already exists on the claim's own organisation, and nothing about
-- the person is copied here — not the name, not the type. The panel reads the
-- contact's type from the contact, so the type is kept in one place.
--
-- WHAT IS NOT IN THIS FILE, ON PURPOSE
--   THE OWNER AND THE SURVEYOR. They are `claims.owner_id` and `claims.surveyor_id`
--     already, and a second column would be a second place for them.
--   THE TAX ADVISER. The adviser is their sign-off record in
--     `tax_adviser_signoffs` (migration 015), never a person linked to a claim.
--   A ROLE COLUMN. The link admits a contact typed ACCOUNTANT or ADVISER when it is
--     made, and the panel says what the contact is now.
--
-- NOTHING HERE IS EVER DELETED. A link is ended once, with who and when.
-- ===========================================================================

CREATE TABLE claim_contacts (
  id           TEXT PRIMARY KEY,
  claim_id     TEXT NOT NULL REFERENCES claims(id),
  contact_id   TEXT NOT NULL REFERENCES contacts(id),
  linked_by    TEXT NOT NULL REFERENCES users(id),
  linked_at    TEXT NOT NULL,
  unlinked_by  TEXT REFERENCES users(id),
  unlinked_at  TEXT,
  CHECK ((unlinked_at IS NULL) = (unlinked_by IS NULL))
) STRICT;

CREATE UNIQUE INDEX claim_contacts_live_uq ON claim_contacts(claim_id, contact_id) WHERE unlinked_at IS NULL;
CREATE INDEX claim_contacts_claim_idx ON claim_contacts(claim_id);

-- THE CLAIM'S OWN ORGANISATION, AND AN ACCOUNTANT OR AN ADVISER. A person at an
-- introducing firm has no organisation of the claim's and is refused here too.
CREATE TRIGGER claim_contacts_same_organisation_insert BEFORE INSERT ON claim_contacts
WHEN NOT EXISTS (
  SELECT 1 FROM contacts ct JOIN claims c ON c.business_id = ct.business_id
   WHERE ct.id = NEW.contact_id AND c.id = NEW.claim_id AND ct.contact_type IN ('ACCOUNTANT','ADVISER'))
  OR NEW.unlinked_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'a claim''s team links the claim''s own organisation''s accountant or adviser, and a link is made live'); END;

CREATE TRIGGER claim_contacts_never_deleted BEFORE DELETE ON claim_contacts
BEGIN SELECT RAISE(ABORT, 'a claim team link is ended by recording who ended it and when, never deleted'); END;

CREATE TRIGGER claim_contacts_only_unlinked BEFORE UPDATE ON claim_contacts
WHEN OLD.unlinked_at IS NOT NULL
  OR NEW.id IS NOT OLD.id OR NEW.claim_id IS NOT OLD.claim_id OR NEW.contact_id IS NOT OLD.contact_id
  OR NEW.linked_by IS NOT OLD.linked_by OR NEW.linked_at IS NOT OLD.linked_at
BEGIN SELECT RAISE(ABORT, 'a claim team link is ended once, by recording who ended it and when; nothing else about it changes'); END;
