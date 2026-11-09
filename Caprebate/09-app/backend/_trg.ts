import { Db, migrate } from './src/db.ts';
import { MIGRATIONS_DIR } from './src/app.ts';
const db = new Db(':memory:'); migrate(db, MIGRATIONS_DIR);
for (const r of db.all<{ name: string; tbl_name: string; sql: string }>("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='trigger' AND sql LIKE '%BEFORE DELETE%' AND tbl_name IN ('leads','enquiry_checks','staff_tasks','automation_runs','consent_answers','outbox','outbox_attachments','outbox_inline_files','lookups_declined','thread_reads','channel_reads','contacts','bookings','businesses','properties','assessments','assessment_answers','estimates','video_meetings','booking_changes','assessment_drafts','research_sources','research_runs')"))
  console.log(r.tbl_name, '|', r.name, '|', r.sql.replace(/\s+/g, ' ').slice(0, 160));
