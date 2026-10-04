-- ===========================================================================
-- 086 — WHETHER A CONTACT AGREED TO WHATSAPP   Phase 153f, 4 October 2026
--
-- Word answer 164 (closed 24 September 2026): no "you may contact me" tick box — sending an enquiry asks to be answered.
-- The four-stage funnel had kept that box, and Sadique's approval of WhatsApp for testing (30 September 2026: "the
-- contact box is enough for testing") leaned on it. The funnel now says it in words and asks a separate, optional
-- question: "You may also message me on WhatsApp about this enquiry." `whatsapp_optin` keeps the answer (1 yes, 0 not
-- asked or no). Contacts already made through the old box (contact_consent = 1) keep that permission for testing, as
-- Sadique approved it: they start at 1. Whether WhatsApp may go to a contact at 0 is a reading for the data protection
-- officer (FOR THE SOLICITOR, THE DPO AND THE DEVELOPER, Phase 153f); the WhatsApp page shows the answer beside each.
-- ===========================================================================

ALTER TABLE contacts ADD COLUMN whatsapp_optin INTEGER NOT NULL DEFAULT 0 CHECK (whatsapp_optin IN (0, 1));
UPDATE contacts SET whatsapp_optin = 1 WHERE contact_consent = 1;
