-- ===========================================================================
-- 117 — THE SEEDED TEMPLATE'S SUBJECT WITHOUT A LONG DASH    Phase 160d, 19 October 2026
--
-- Lakhbir: "remove the — AI uses". Every email already loses its long dashes on the way into the outbox (Phase 160d,
-- src/stubs/email.ts), but the one email template migration 012 seeded still shows "—" in its subject on the Email
-- templates screen, where Admin edits it. This changes that subject only while it is still exactly as migration 032
-- left it: a template Admin has already changed is Admin's own wording and is left alone.
-- ===========================================================================

UPDATE email_templates
SET subject = '{{organisation}}: the next step on your claim', updated_at = '2026-10-19T00:00:00.000Z'
WHERE id = 'template-next-step' AND subject = '{{organisation}} — the next step on your claim';
