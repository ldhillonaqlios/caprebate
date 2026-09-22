-- ===========================================================================
-- 039 — PLAIN WORDS IN THE ROWS THE MIGRATIONS SEEDED.   Phase 144a, 22 September 2026
--
-- WHY. Phase 144 rewrote every screen's words, and its check reads source files.
-- It cannot read words stored in rows, and a person reads some of those on a
-- screen: the reasons a lead is lost or a claim stops (a list on Admin settings,
-- and the choice when you stop one), and the tasks two automation rules create.
-- Five reason labels and two task texts were above grade 9, or used a word from
-- the banned list ("cost elements").
--
-- WHAT IS NOT HERE, AND WHY.
--   * The next-step email template's sign-off already says "Cap Rebate":
--     migration 030 changed it on 17 September 2026. Nothing to do.
--   * A reason's CODE never changes (reason_lists_code_is_permanent). Old leads
--     and claims point at the code, so they read the new label too. The meaning
--     of each reason is unchanged — only the words.
--   * The automation rules' notes are shown through SEEDED_RULE_WHY in
--     src/web/automation.ts (Phase 144); the stored text is left as written.
--   * Dated setting rows (finance and compliance settings) are records with a
--     source, never edited in place. Their sources quote documents by name.
--   * The receipt recommendations (migration 021) are the data protection
--     officer's wording, awaiting their sign-off, and shown on no screen.
--
-- EACH ROW CHANGES ONLY WHILE IT STILL HOLDS EXACTLY THE SEEDED WORDS, so a label
-- an administrator has since edited is left as they wrote it.
-- ===========================================================================

UPDATE reason_lists
   SET label = 'The person asking cannot show they own it, or that they may act for the owner'
 WHERE code = 'OWNERSHIP_NOT_DEMONSTRATED'
   AND label = 'The enquirer cannot demonstrate ownership or authority to act for the owner';

UPDATE reason_lists
   SET label = 'The person asking will not say which property it is, or who owns it'
 WHERE label = 'The enquirer will not identify the property or the ownership structure';

UPDATE reason_lists
   SET label = 'The client cannot give us even rough costs or floor areas'
 WHERE label = 'The client cannot supply even approximate cost or floor area data';

UPDATE reason_lists
   SET label = 'A section 198 election at a token value, or with no clear scope, covers the property'
 WHERE label = 'A nominal or unscoped section 198 election affects the property';

UPDATE reason_lists
   SET label = 'A grant or other payment cannot be matched to the items it paid for'
 WHERE code = 'GRANT_NOT_TRACEABLE'
   AND label = 'A grant or contribution cannot be traced to specific cost elements';

UPDATE automation_rules
   SET task_title = 'Prepare the valuation from the surveyor''s measured record, with a source for every rate',
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE id = 'rule-committed-valuation'
   AND task_title = 'Prepare the valuation under the surveyor''s measured record, every rate sourced';

UPDATE automation_rules
   SET task_description = 'This is a task, not an email. Invoice emails wait until our procedure against invoice fraud is in force.',
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE id = 'rule-invoice-finance-task'
   AND task_description = 'A task, never an email: the invoice email waits on the invoice-fraud procedure.';
