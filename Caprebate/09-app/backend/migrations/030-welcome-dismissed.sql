-- ===========================================================================
-- 030 — THE WELCOME CARD'S DISMISSAL, ON THE USER.     Phase 133c, 17 September 2026
--
-- WHY. A person signing in for the first time sees a welcome card on Home with
-- the three jobs their login does most. Once they hide it, it stays hidden, on
-- any device: so the dismissal is stored on the user, not in the browser.
--
-- WHAT THIS IS. One nullable moment. NULL means the card has not been hidden.
-- It is written once, by src/web/welcome.ts, and the write is audited
-- (WELCOME_DISMISSED). Nothing clears it: a card that came back would be a
-- surprise, and "show me the welcome again" is a job for the Help link.
-- ===========================================================================

ALTER TABLE users ADD COLUMN welcome_dismissed_at TEXT;

-- ---------------------------------------------------------------------------
-- AND THE NAME A PERSON READS, IN TWO SEEDED ROWS. The brand is "Cap Rebate",
-- two words (brand book v1.0, slide 1). Migrations 012 and 013 seeded the old
-- spelling into an email template's sign-off and a document type's label. Each
-- row is changed ONLY while it still holds exactly the seeded words, so a value
-- an administrator has since edited is left as they wrote it.
-- ---------------------------------------------------------------------------

UPDATE email_templates
   SET body = substr(body, 1, length(body) - length('Caprebate')) || 'Cap Rebate'
 WHERE id = 'template-next-step'
   AND substr(body, length(body) - length('Caprebate') + 1) = 'Caprebate';

UPDATE document_types
   SET label = 'Cap Rebate''s fee invoice'
 WHERE code = 'INVOICE' AND label = 'Caprebate''s fee invoice';
