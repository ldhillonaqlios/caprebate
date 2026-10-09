/**
 * PHASE 157 (the sweep), 6 October 2026 — THE FUNNEL'S OWN TABLES: the only tables a lost funnel enquiry's deletion may
 * reach (src/web/enquiry-retention.ts, leadDeletionPlan). A row in any other table that hangs off the lead or its
 * organisation is a reason to keep everything: it has a retention rule of its own, or it is evidence.
 *
 * The foreign keys from these tables' rows are written out as literal statements in src/web/funnel-edges.ts, which
 * tools/gen-funnel-edges.ts generates from the database's own schema (no SQL is ever built from a string at run time;
 * tools/lint-sql.cjs). test/phase157.test.ts fails when the schema gains an edge that file lacks.
 */
export const FUNNEL_DELETABLE_TABLES: readonly string[] = Object.freeze([
  'leads', 'contacts', 'consent_answers', 'bookings', 'booking_changes', 'video_meetings', 'outbox', 'outbox_attachments',
  'outbox_inline_files', 'staff_tasks', 'automation_runs', 'enquiry_checks',
  // the organisation, only when every lead of it goes
  'businesses', 'properties', 'assessments', 'assessment_answers', 'estimates', 'assessment_drafts', 'research_sources',
  'research_runs', 'lookups_declined', 'thread_reads', 'channel_reads',
  // PHASE 159c: each building's events, as the assessment gave them (migration 105) — the funnel's own answers, kept on the property
  'property_events',
  // the portal sign-up the funnel offered at its close, never taken up (one taken up made a login)
  'client_signups',
]);

/** One foreign key from a funnel table's row to the rows that point at it, as two literal statements. */
export type FunnelEdge = {
  readonly parent: string; readonly child: string;
  readonly parent_cols: readonly string[]; readonly child_cols: readonly string[];
  readonly parent_sql: string; readonly child_sql: string;
};
