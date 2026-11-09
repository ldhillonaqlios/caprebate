/**
 * BORROWED: SQL ON OTHER AREAS' TABLES, RUN FROM THE SHARED (Phase 161i1; 09-app/docs/ARCHITECTURE.md rules 3
 * and 4). These statements were in shared's page and logic files, which may not run SQL (rule 4). They read or write
 * tables a business area owns, so they still go against rule 3 (each counted against the table's owner), and Phase
 * 161l (the tangle undone) moves each one to its owner's data file, reached through that owner's front door or an
 * event. Nothing new belongs here: this file only gets shorter. Text unchanged from the caller.
 */
import type { Db, Param, Row } from '../core/index.ts';

// the claim and lead lists (src/shared/lists.ts): the fixed statements, moved with their notes
/** CLIENT AND REFERENCE — the whole of what ACCOUNTING reads of a claim. No join to anything else. */
const CLAIMS_MONEY =
  'SELECT c.id, c.claim_ref, c.business_id, b.name AS client, c.created_at, NULL AS sector, NULL AS org_source, NULL AS stage, ' +
  'NULL AS workstream, NULL AS owner_id, NULL AS owner_name, NULL AS priority, NULL AS expected_completion, NULL AS property_label, ' +
  'NULL AS property_type, NULL AS jurisdiction, NULL AS postcode, NULL AS lead_source, NULL AS introducer_id, NULL AS firm_name, ' +
  'NULL AS next_action, NULL AS next_action_due, NULL AS q, NULL AS shown_low_pence, NULL AS shown_high_pence, NULL AS has_estimate ' +
  'FROM claims c JOIN businesses b ON b.id = c.business_id ORDER BY c.claim_ref DESC LIMIT 1000';

/** THE WORKING LINE — no estimate, no assessment, for a reader who may not read the value. */
const CLAIMS_WORKING =
  'SELECT c.id, c.claim_ref, c.business_id, b.name AS client, c.created_at, b.sector, b.source AS org_source, c.stage, c.workstream, ' +
  'c.owner_id, u.display_name AS owner_name, c.priority, c.expected_completion, p.label AS property_label, p.property_type, ' +
  'p.jurisdiction, p.postcode, l.source AS lead_source, l.introducer_id, i.firm_name, ' +
  "(SELECT t.title FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN ('OPEN','IN_PROGRESS')) AS next_action, " +
  "(SELECT t.due_on FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN ('OPEN','IN_PROGRESS')) AS next_action_due, " +
  'NULL AS q, NULL AS shown_low_pence, NULL AS shown_high_pence, NULL AS has_estimate ' +
  'FROM claims c JOIN businesses b ON b.id = c.business_id LEFT JOIN users u ON u.id = c.owner_id ' +
  'LEFT JOIN properties p ON p.id = c.property_id LEFT JOIN leads l ON l.claim_id = c.id LEFT JOIN introducers i ON i.id = l.introducer_id ' +
  'ORDER BY c.claim_ref DESC LIMIT 1000';

/** THE WORKING LINE AND THE VALUE — for a reader `claim.read_value` admits, and still asked per claim. */
const CLAIMS_VALUE =
  'SELECT c.id, c.claim_ref, c.business_id, b.name AS client, c.created_at, b.sector, b.source AS org_source, c.stage, c.workstream, ' +
  'c.owner_id, u.display_name AS owner_name, c.priority, c.expected_completion, p.label AS property_label, p.property_type, ' +
  'p.jurisdiction, p.postcode, l.source AS lead_source, l.introducer_id, i.firm_name, ' +
  "(SELECT t.title FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN ('OPEN','IN_PROGRESS')) AS next_action, " +
  "(SELECT t.due_on FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN ('OPEN','IN_PROGRESS')) AS next_action_due, " +
  '(SELECT e.qualifying_expenditure_pence FROM estimates e WHERE e.assessment_id = c.assessment_id ORDER BY e.rowid DESC LIMIT 1) AS q, ' +
  'a.shown_low_pence, a.shown_high_pence, ' +
  '(SELECT COUNT(*) FROM estimates e WHERE e.assessment_id = c.assessment_id) AS has_estimate ' +
  'FROM claims c JOIN businesses b ON b.id = c.business_id LEFT JOIN users u ON u.id = c.owner_id ' +
  'LEFT JOIN properties p ON p.id = c.property_id LEFT JOIN leads l ON l.claim_id = c.id LEFT JOIN introducers i ON i.id = l.introducer_id ' +
  'LEFT JOIN assessments a ON a.id = c.assessment_id ORDER BY c.claim_ref DESC LIMIT 1000';

/** A LEAD'S NEXT ACTION IS ITS EARLIEST OPEN TASK — migration 018 retired the free text. One sort, one source. */
const LEADS_ALL =
  'SELECT l.id, l.business_id, l.assessment_id, l.origin, l.source, l.introducer_id, i.firm_name, l.prospect_organisation, ' +
  'l.prospect_sector, l.lead_date, l.owner_id, u.display_name AS owner_name, l.priority, l.status, l.claim_id, c.claim_ref, ' +
  'b.name AS business_name, b.sector AS business_sector, ' +
  "(SELECT t.title FROM staff_tasks t WHERE t.lead_id = l.id AND t.status IN ('OPEN','IN_PROGRESS') " +
  'ORDER BY t.due_on IS NULL, t.due_on ASC, t.created_at ASC, t.id ASC LIMIT 1) AS next_action, ' +
  "(SELECT t.due_on FROM staff_tasks t WHERE t.lead_id = l.id AND t.status IN ('OPEN','IN_PROGRESS') " +
  'ORDER BY t.due_on IS NULL, t.due_on ASC, t.created_at ASC, t.id ASC LIMIT 1) AS next_action_due, ' +
  'a.shown_low_pence, a.shown_high_pence ' +
  'FROM leads l LEFT JOIN businesses b ON b.id = l.business_id LEFT JOIN users u ON u.id = l.owner_id ' +
  'LEFT JOIN claims c ON c.id = l.claim_id LEFT JOIN introducers i ON i.id = l.introducer_id ' +
  'LEFT JOIN assessments a ON a.id = l.assessment_id ORDER BY l.lead_date DESC, l.id ASC LIMIT 1000';

/** The claim list's rows in the shape its reader may see: the money line, the working line and the value, or the working line. */
export function listClaimsRows<T extends Row = Row>(db: Db, shape: 'MONEY' | 'VALUE' | 'WORKING'): T[] {
  const statement = shape === 'MONEY' ? CLAIMS_MONEY : shape === 'VALUE' ? CLAIMS_VALUE : CLAIMS_WORKING;
  return db.all<T>(statement);
}
export function listLeadsRows<T extends Row = Row>(db: Db): T[] {
  return db.all<T>(LEADS_ALL);
}
