/**
 * THE LISTS — FILTERS, SORTS, SAVED VIEWS AND EXPORT. CRM 9 of 10, 12 September 2026.
 *
 * The scope is 09-app/CAPREBATE-CRM-DISPOSITION.md, rows 16.2 to 16.6, and the
 * decisions this file takes are that table's Part E from E119. The pages are the
 * claims and leads lists (src/web/crm-pages.ts, src/web/pipeline-pages.ts), which
 * draw `listControls` from src/web/lists-pages.ts; saved views are migration 018.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * A FILTER OR A SORT IS A KEY IN A FIXED TABLE, NEVER SQL. `readParams` reads a
 * request through `CLAIM_FILTERS`, `LEAD_FILTERS` and the two sort tables; an
 * unknown key is dropped and said, and an ORDER BY is never built from a request
 * value — the rule src/web/engaged-pages.ts already follows (row 16.4). The rows
 * are read once, each asked of `can()`, and then filtered and sorted in code.
 *
 * A LIST IS BUILT FORWARDS FOR ITS READER, EXACTLY AS THE LIST BEFORE IT WAS.
 * ACCOUNTING reads a claim as client and reference — the test `claimList` in
 * src/web/crm.ts makes, and the statement it reads carries no join to the
 * property, the lead, the assessment or the estimate. SURVEYING reads the working
 * line and never a value: its statement carries no estimate at all. A filter or a
 * sort on a column the reader does not read is ignored, and the page says which
 * and why. Value is filtered and sorted only where `claim.read_value` says yes,
 * and a claim with no estimate is in no value filter — not known is not below or
 * above a figure (N4).
 *
 * EXPORT IS THE LIST, AS CSV, AUDITED. The columns are the reader's own row shape
 * and no more; the audit line names the list, the columns, the row count, the
 * filter keys and the sort — never a value. Every cell that begins with = + - @, a
 * tab or a carriage return is neutralised against spreadsheet formula injection.
 * No export reaches the compliance registers, S2 or the retention list: nothing
 * here reads them.
 */

import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { authorise, can, type Actor, type Obj } from '../authz.ts';
import { NotFoundAsRefusal } from './backoffice.ts';
import { JURISDICTIONS, WORKSTREAMS, claimObjFor, derivedJurisdiction, type ClaimRow } from './crm.ts';
import { priorityRank, vocabLabel, vocabulary } from './vocabularies.ts';
import { LEAD_ORIGINS, LEAD_STATUSES, NO_RANGE_NO_ASSESSMENT, RANGE_NOT_SHOWN, SECTORS, assertLeadSection, type LeadRow } from './leads.ts';
import { CLOSED_STAGE, EXITS, ON_HOLD_STAGE, PROCEDURE_STAGES, claimStage } from './stages.ts';
import { formatShownRange } from './shown-range.ts';
import { localDate, localStamp } from './localtime.ts';

type Vocab = Readonly<Record<string, string>>;

export type ListKey = 'CLAIMS' | 'LEADS';
export type ListDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string };

export type FilterDef = {
  readonly key: string;
  readonly label: string;
  readonly kind: 'choice' | 'date' | 'money';
  /** A filter on the estimate, offered and applied only where the reader may read it. */
  readonly needs_value?: boolean;
  /** A filter on the working line, which a reader of client and reference alone does not have. */
  readonly needs_working?: boolean;
};

export type ListParams = { readonly filters: Readonly<Record<string, string>>; readonly sort: string };
export type Choice = { readonly value: string; readonly label: string };

export const NONE = 'none';

export const CLAIM_FILTERS: readonly FilterDef[] = Object.freeze([
  { key: 'owner', label: 'Owner', kind: 'choice', needs_working: true },
  { key: 'stage', label: 'Stage', kind: 'choice', needs_working: true },
  { key: 'status', label: 'Where it stands', kind: 'choice', needs_working: true },
  { key: 'source', label: 'Source', kind: 'choice', needs_working: true },
  { key: 'introducer', label: 'Introducer', kind: 'choice', needs_working: true },
  { key: 'sector', label: 'Sector', kind: 'choice', needs_working: true },
  { key: 'property_type', label: 'Property type', kind: 'choice', needs_working: true },
  { key: 'jurisdiction', label: 'Jurisdiction', kind: 'choice', needs_working: true },
  { key: 'from', label: 'Opened on or after', kind: 'date' },
  { key: 'to', label: 'Opened on or before', kind: 'date' },
  { key: 'value_min', label: 'Estimated value at least, £', kind: 'money', needs_value: true, needs_working: true },
  { key: 'value_max', label: 'Estimated value at most, £', kind: 'money', needs_value: true, needs_working: true },
] as FilterDef[]);

export const CLAIM_SORTS: Vocab = Object.freeze({
  reference: 'Reference, newest first',
  next_action: 'Next action due, soonest first',
  due_date: 'Expected completion, soonest first',
  age: 'Age, oldest first',
  value: 'Estimated value, highest first',
  priority: 'Priority, highest first',
});

export const LEAD_FILTERS: readonly FilterDef[] = Object.freeze([
  { key: 'owner', label: 'Owner', kind: 'choice' },
  { key: 'source', label: 'Source', kind: 'choice' },
  { key: 'introducer', label: 'Introducer', kind: 'choice' },
  { key: 'sector', label: 'Sector', kind: 'choice' },
  { key: 'status', label: 'Status', kind: 'choice' },
  { key: 'from', label: 'Lead date on or after', kind: 'date' },
  { key: 'to', label: 'Lead date on or before', kind: 'date' },
] as FilterDef[]);

export const LEAD_SORTS: Vocab = Object.freeze({
  newest: 'Newest first',
  next_action: 'Next action due, soonest first',
  age: 'Age, oldest first',
  value: 'Range shown, highest first',
  priority: 'Priority, highest first',
});

export const CLAIM_STATUSES: Vocab = Object.freeze({
  OPEN: 'At one of the ten stages', ON_HOLD: 'On hold', CLOSED: 'Closed', EXITED: 'Left the procedure by an exit',
  UNKNOWN: 'Stage not recognised',
});

const DEFAULT_SORT: Readonly<Record<ListKey, string>> = Object.freeze({ CLAIMS: 'reference', LEADS: 'newest' });

function words(vocab: Vocab, v: string | null | undefined, none: string): string {
  return typeof v === 'string' && Object.hasOwn(vocab, v) ? (vocab[v] ?? v) : none;
}

/* ================================================================== *
 * 1 · READING A REQUEST — the fixed tables, and nothing else
 * ================================================================== */

export function filtersOf(list: ListKey): readonly FilterDef[] {
  return list === 'CLAIMS' ? CLAIM_FILTERS : LEAD_FILTERS;
}

export function sortsOf(list: ListKey): Vocab {
  return list === 'CLAIMS' ? CLAIM_SORTS : LEAD_SORTS;
}

export function readParams(list: ListKey, q: URLSearchParams): { params: ListParams; ignored: string[] } {
  const filters: Record<string, string> = {};
  const ignored: string[] = [];
  for (const f of filtersOf(list)) {
    const raw = (q.get(f.key) ?? '').trim();
    if (raw === '') continue;
    if (raw.length > 100) { ignored.push(`${f.label}: longer than any value it can have`); continue; }
    if (f.kind === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) { ignored.push(`${f.label}: not a date, as YYYY-MM-DD`); continue; }
    if (f.kind === 'money') {
      const pounds = raw.replace(/[£,\s]/g, '');
      if (!/^\d{1,12}$/.test(pounds)) { ignored.push(`${f.label}: not a whole number of pounds`); continue; }
      filters[f.key] = pounds;
      continue;
    }
    filters[f.key] = raw;
  }
  // AN UNKNOWN KEY IS DROPPED AND SAID. `view` names a saved view and is read by the page, not here.
  const known = new Set([...filtersOf(list).map((f) => f.key), 'sort', 'view']);
  for (const k of new Set(q.keys())) {
    if (!known.has(k)) ignored.push(`${k.slice(0, 40)}: not a filter this list offers, so it was not applied`);
  }
  const asked = (q.get('sort') ?? '').trim();
  const sorts = sortsOf(list);
  const sort = asked !== '' && Object.hasOwn(sorts, asked) ? asked : DEFAULT_SORT[list];
  if (asked !== '' && sort !== asked) ignored.push('Sort: not one of the orders offered');
  return { params: { filters, sort }, ignored };
}

/** The parameters as a query string of known keys, in a fixed order — what a saved view stores. */
export function canonical(p: ListParams): string {
  const u = new URLSearchParams();
  for (const k of Object.keys(p.filters).sort()) u.set(k, p.filters[k] ?? '');
  u.set('sort', p.sort);
  return u.toString();
}

/* ================================================================== *
 * 2 · THE CLAIMS LIST
 * ================================================================== */

export type ListShape = 'MONEY' | 'WORKING' | 'VALUE';

export type ClaimListRow = ClaimRow & {
  readonly opened: string;
  readonly priority?: string;
  readonly next_action_due?: string | null;
  readonly expected_completion?: string | null;
};

export type ListView<R> = {
  readonly list: ListKey;
  readonly shape: ListShape;
  readonly rows: readonly R[];
  readonly read: number;
  readonly applied: readonly { readonly key: string; readonly label: string; readonly value: string }[];
  readonly said: readonly string[];
  /**
   * THE CRM FOLLOW-ON: the keys of every filter asked for and NOT applied because this reader does not read its column — and
   * `sort` where the order asked for was not used. The page says them in `said`; a CSV file cannot, so the export's audit
   * line records these and the page says them beside the export link.
   */
  readonly not_applied: readonly string[];
  readonly sort: { readonly key: string; readonly label: string };
  readonly filters: readonly FilterDef[];
  readonly choices: Readonly<Record<string, readonly Choice[]>>;
  readonly sorts: readonly Choice[];
  readonly params: string;
  readonly may_export: boolean;
};

type ClaimListDb = {
  id: string; claim_ref: string; business_id: string; client: string; created_at: string;
  sector: string | null; org_source: string | null; stage: string | null; workstream: string | null; owner_id: string | null;
  owner_name: string | null; priority: string | null; expected_completion: string | null; property_label: string | null;
  property_type: string | null; jurisdiction: string | null; postcode: string | null; lead_source: string | null;
  introducer_id: string | null; firm_name: string | null; next_action: string | null; next_action_due: string | null;
  q: number | null; shown_low_pence: number | null; shown_high_pence: number | null; has_estimate: number | null;
};

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

const VALUE_SENTINEL: Obj = { type: 'claim', id: '__list__', business_id: '__list__', assigned_surveyor_ids: [] };
const EXPORT_OBJ: Obj = { type: 'pipeline', id: '__export__' };

const STAGE_CHOICES: readonly Choice[] = Object.freeze([
  ...PROCEDURE_STAGES.map((s) => ({ value: s.key as string, label: s.label })),
  { value: ON_HOLD_STAGE.key, label: ON_HOLD_STAGE.label },
  { value: CLOSED_STAGE.key, label: CLOSED_STAGE.label },
  ...EXITS.map((e) => ({ value: e.key as string, label: `Exit — ${e.label}` })),
]);

function vocabChoices(v: Vocab, none: string | null): Choice[] {
  return [...Object.entries(v).map(([value, label]) => ({ value, label })), ...(none === null ? [] : [{ value: NONE, label: none }])];
}

function distinct(pairs: readonly (readonly [string | null, string])[], none: string | null): Choice[] {
  const seen = new Map<string, string>();
  for (const [v, l] of pairs) if (v !== null && !seen.has(v)) seen.set(v, l);
  return [...[...seen.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label })),
    ...(none === null ? [] : [{ value: NONE, label: none }])];
}

function statusOf(stage: string | null): string {
  const k = claimStage(stage).kind;
  return k === 'PROCEDURE' ? 'OPEN' : k === 'EXIT' ? 'EXITED' : k;
}

/** Nulls last, whatever the direction. */
function cmp<T>(a: T | null | undefined, b: T | null | undefined, asc = true): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1;
  if (b === null || b === undefined) return -1;
  if (a === b) return 0;
  return (a < b ? -1 : 1) * (asc ? 1 : -1);
}

function jurisdictionValue(r: { jurisdiction: string | null; postcode: string | null }): string | null {
  const d = derivedJurisdiction(r.postcode);
  return d.derived && d.value !== null ? d.value : r.jurisdiction;
}

function assertClaimList(actor: Actor): void {
  authorise(actor, 'claim.enter', VALUE_SENTINEL);
}

export function claimsList(db: Db, actor: Actor, p: ListParams, ignored: readonly string[] = []): ListView<ClaimListRow> {
  assertClaimList(actor);
  // THE SAME TEST `claimList` MAKES: accounting reads client and reference. Then the value, by the rule table.
  const shape: ListShape = actor.role === 'ACCOUNTING' ? 'MONEY' : can(actor, 'claim.read_value', VALUE_SENTINEL) ? 'VALUE' : 'WORKING';
  const statement = shape === 'MONEY' ? CLAIMS_MONEY : shape === 'VALUE' ? CLAIMS_VALUE : CLAIMS_WORKING;
  const readable = db.all<ClaimListDb>(statement).filter((r) => can(actor, 'claim.read', claimObjFor(db, r)));
  const rank = priorityRank(db);
  const said = [...ignored];
  const applied: { key: string; label: string; value: string }[] = [];

  const choices: Record<string, readonly Choice[]> = shape === 'MONEY' ? {} : {
    owner: distinct(readable.map((r) => [r.owner_id, r.owner_name ?? 'a former user'] as const), 'Nobody yet'),
    stage: STAGE_CHOICES,
    status: vocabChoices(CLAIM_STATUSES, null),
    source: vocabChoices(vocabulary(db, 'LEAD_SOURCE'), 'Not recorded'),
    introducer: distinct(readable.map((r) => [r.introducer_id, r.firm_name ?? 'a firm'] as const), 'No firm'),
    sector: vocabChoices(SECTORS, null),
    property_type: distinct(readable.map((r) => [r.property_type, vocabLabel(db, 'PROPERTY_TYPE', r.property_type, '')] as const), 'Not recorded'),
    jurisdiction: vocabChoices(JURISDICTIONS, 'Not known'),
  };
  const labelOf = (key: string, v: string): string => (choices[key] ?? []).find((c) => c.value === v)?.label ?? v;

  let rows = readable;
  let valueUnknown = 0;
  const notApplied: string[] = [];
  for (const f of CLAIM_FILTERS) {
    const v = p.filters[f.key];
    if (v === undefined) continue;
    if (f.needs_working === true && shape === 'MONEY') { said.push(`${f.label}: not a column a reader of client and reference reads, so it was not applied`); notApplied.push(f.key); continue; }
    if (f.needs_value === true && shape !== 'VALUE') { said.push(`${f.label}: the value is not shown to this role, so it was not applied`); notApplied.push(f.key); continue; }
    const before = rows;
    switch (f.key) {
      case 'owner': rows = rows.filter((r) => (v === NONE ? r.owner_id === null : r.owner_id === v)); break;
      case 'stage': rows = rows.filter((r) => r.stage === v); break;
      case 'status': rows = rows.filter((r) => statusOf(r.stage) === v); break;
      case 'source': rows = rows.filter((r) => { const s = r.lead_source ?? r.org_source; return v === NONE ? s === null : s === v; }); break;
      case 'introducer': rows = rows.filter((r) => (v === NONE ? r.introducer_id === null : r.introducer_id === v)); break;
      case 'sector': rows = rows.filter((r) => r.sector === v); break;
      case 'property_type': rows = rows.filter((r) => (v === NONE ? r.property_type === null : r.property_type === v)); break;
      case 'jurisdiction': rows = rows.filter((r) => { const j = jurisdictionValue(r); return v === NONE ? j === null : j === v; }); break;
      case 'from': rows = rows.filter((r) => localDate(r.created_at) >= v); break;
      case 'to': rows = rows.filter((r) => localDate(r.created_at) <= v); break;
      case 'value_min': case 'value_max': {
        const pence = Number(v) * 100;
        valueUnknown = Math.max(valueUnknown, rows.filter((r) => r.q === null).length);
        rows = rows.filter((r) => r.q !== null && (f.key === 'value_min' ? r.q >= pence : r.q <= pence));
        break;
      }
      default: rows = before;
    }
    applied.push({ key: f.key, label: f.label, value: f.kind === 'choice' ? labelOf(f.key, v) : f.kind === 'money' ? `£${Number(v).toLocaleString('en-GB')}` : v });
  }
  if (valueUnknown > 0) {
    said.push(`${valueUnknown} ${valueUnknown === 1 ? 'claim carries' : 'claims carry'} no sealed estimate and ${valueUnknown === 1 ? 'is' : 'are'} in no value filter — not known is not below or above a figure`);
  }

  let sort = p.sort;
  if ((sort === 'value' && shape !== 'VALUE') || (shape === 'MONEY' && !['reference', 'age'].includes(sort))) {
    said.push(`Sort: ${CLAIM_SORTS[sort] ?? sort} is not a column this role reads, so the list is in reference order`);
    sort = 'reference';
    notApplied.push('sort');
  }
  const sorted = [...rows].sort((a, b) => {
    const tie = cmp(b.claim_ref, a.claim_ref);
    switch (sort) {
      case 'next_action': return cmp(a.next_action_due, b.next_action_due) || tie;
      case 'due_date': return cmp(a.expected_completion, b.expected_completion) || tie;
      case 'age': return cmp(a.created_at, b.created_at) || tie;
      case 'value': return cmp(a.q, b.q, false) || tie;
      case 'priority': return rank(a.priority) - rank(b.priority) || tie;
      default: return tie;
    }
  });

  return {
    list: 'CLAIMS', shape, read: readable.length, applied, said, not_applied: notApplied,
    sort: { key: sort, label: CLAIM_SORTS[sort] ?? sort },
    filters: CLAIM_FILTERS.filter((f) => !(f.needs_working === true && shape === 'MONEY') && !(f.needs_value === true && shape !== 'VALUE')),
    choices,
    sorts: Object.entries(CLAIM_SORTS).filter(([k]) => !(k === 'value' && shape !== 'VALUE') && !(shape === 'MONEY' && !['reference', 'age'].includes(k)))
      .map(([value, label]) => ({ value, label })),
    params: canonical({ filters: Object.fromEntries(applied.map((x) => [x.key, p.filters[x.key] ?? ''])), sort }),
    may_export: can(actor, 'list.export', EXPORT_OBJ),
    rows: sorted.map((r): ClaimListRow => {
      const base = { id: r.id, claim_ref: r.claim_ref, client: r.client, opened: localDate(r.created_at) };
      if (shape === 'MONEY') return base;
      const working = {
        ...base, property: r.property_label, stage: claimStage(r.stage).label, workstream: words(WORKSTREAMS, r.workstream, r.workstream ?? ''),
        owner: r.owner_name, next_action: r.next_action, next_action_due: r.next_action_due,
        priority: vocabLabel(db, 'PRIORITY', r.priority, 'not set'), expected_completion: r.expected_completion,
      };
      if (shape !== 'VALUE' || !can(actor, 'claim.read_value', claimObjFor(db, r))) return working;
      return {
        ...working,
        shown_range: (r.has_estimate ?? 0) > 0 ? formatShownRange({ low_pence: r.shown_low_pence, high_pence: r.shown_high_pence }) : 'no estimate yet',
      };
    }),
  };
}

/* ================================================================== *
 * 3 · THE LEADS LIST
 * ================================================================== */

export type LeadListRow = LeadRow & { readonly priority: string };

type LeadListDb = {
  id: string; business_id: string | null; assessment_id: string | null; origin: string; source: string; introducer_id: string | null;
  firm_name: string | null; prospect_organisation: string | null; prospect_sector: string | null; lead_date: string; owner_id: string | null;
  owner_name: string | null; priority: string | null; status: string; claim_id: string | null; claim_ref: string | null;
  business_name: string | null; business_sector: string | null; next_action: string | null; next_action_due: string | null;
  shown_low_pence: number | null; shown_high_pence: number | null;
};

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

export function leadsList(db: Db, actor: Actor, p: ListParams, ignored: readonly string[] = []): ListView<LeadListRow> {
  assertLeadSection(actor);
  const readable = db.all<LeadListDb>(LEADS_ALL).filter((r) => can(actor, 'lead.read', { type: 'lead', id: r.id, business_id: r.business_id }));
  const rank = priorityRank(db);
  const rangeOf = (r: LeadListDb): string | undefined =>
    r.business_id === null || r.assessment_id === null
      || !can(actor, 'estimate.read', { type: 'estimate', id: r.assessment_id, business_id: r.business_id })
      ? undefined : formatShownRange({ low_pence: r.shown_low_pence, high_pence: r.shown_high_pence });
  const mayValue = can(actor, 'estimate.read', { type: 'estimate', id: '__list__', business_id: '__list__' });
  const said = [...ignored];
  const applied: { key: string; label: string; value: string }[] = [];
  const choices: Record<string, readonly Choice[]> = {
    owner: distinct(readable.map((r) => [r.owner_id, r.owner_name ?? 'a former user'] as const), 'Nobody yet'),
    source: vocabChoices(vocabulary(db, 'LEAD_SOURCE'), null),
    introducer: distinct(readable.map((r) => [r.introducer_id, r.firm_name ?? 'a firm'] as const), 'No firm'),
    sector: vocabChoices(SECTORS, 'Not recorded'),
    status: vocabChoices(LEAD_STATUSES, null),
  };
  const labelOf = (key: string, v: string): string => (choices[key] ?? []).find((c) => c.value === v)?.label ?? v;
  let rows = readable;
  for (const f of LEAD_FILTERS) {
    const v = p.filters[f.key];
    if (v === undefined) continue;
    switch (f.key) {
      case 'owner': rows = rows.filter((r) => (v === NONE ? r.owner_id === null : r.owner_id === v)); break;
      case 'source': rows = rows.filter((r) => r.source === v); break;
      case 'introducer': rows = rows.filter((r) => (v === NONE ? r.introducer_id === null : r.introducer_id === v)); break;
      case 'sector': rows = rows.filter((r) => { const s = r.business_sector ?? r.prospect_sector; return v === NONE ? s === null : s === v; }); break;
      case 'status': rows = rows.filter((r) => r.status === v); break;
      case 'from': rows = rows.filter((r) => localDate(r.lead_date) >= v); break;
      case 'to': rows = rows.filter((r) => localDate(r.lead_date) <= v); break;
      default: break;
    }
    applied.push({ key: f.key, label: f.label, value: f.kind === 'choice' ? labelOf(f.key, v) : v });
  }
  let sort = p.sort;
  if (sort === 'value' && !mayValue) {
    said.push('Sort: the range shown is not shown to this role, so the list is newest first');
    sort = 'newest';
  }
  const highOf = (r: LeadListDb): number | null => (rangeOf(r) === undefined ? null : r.shown_high_pence);
  const sorted = [...rows].sort((a, b) => {
    const tie = cmp(b.lead_date, a.lead_date) || cmp(a.id, b.id);
    switch (sort) {
      case 'next_action': return cmp(a.next_action_due, b.next_action_due) || tie;
      case 'age': return cmp(a.lead_date, b.lead_date) || cmp(a.id, b.id);
      case 'value': return cmp(highOf(a), highOf(b), false) || tie;
      case 'priority': return rank(a.priority) - rank(b.priority) || tie;
      default: return tie;
    }
  });
  return {
    list: 'LEADS', shape: mayValue ? 'VALUE' : 'WORKING', read: readable.length, applied, said, not_applied: sort === p.sort ? [] : ['sort'],
    sort: { key: sort, label: LEAD_SORTS[sort] ?? sort },
    filters: LEAD_FILTERS, choices,
    sorts: Object.entries(LEAD_SORTS).filter(([k]) => k !== 'value' || mayValue).map(([value, label]) => ({ value, label })),
    params: canonical({ filters: Object.fromEntries(applied.map((x) => [x.key, p.filters[x.key] ?? ''])), sort }),
    may_export: can(actor, 'list.export', EXPORT_OBJ),
    rows: sorted.map((r): LeadListRow => {
      const range = rangeOf(r);
      return {
        id: r.id,
        organisation: r.business_name ?? r.prospect_organisation ?? 'no organisation recorded',
        organisation_recorded: r.business_id !== null,
        source: vocabLabel(db, 'LEAD_SOURCE', r.source, r.source),
        origin: words(LEAD_ORIGINS, r.origin, r.origin),
        lead_date: localStamp(r.lead_date),
        owner: r.owner_name,
        status: { key: r.status, label: words(LEAD_STATUSES, r.status, r.status) },
        next_action: r.next_action, next_action_due: r.next_action_due,
        claim: r.claim_id === null || r.claim_ref === null ? null : { id: r.claim_id, claim_ref: r.claim_ref },
        priority: vocabLabel(db, 'PRIORITY', r.priority, 'not set'),
        // THE CRM FOLLOW-ON: a lead with no assessment has no range, which is not a range this role may not read.
        ...(range === undefined
          ? { range_note: r.business_id === null || r.assessment_id === null ? NO_RANGE_NO_ASSESSMENT : RANGE_NOT_SHOWN }
          : { shown_range: range }),
      };
    }),
  };
}

/* ================================================================== *
 * 4 · SAVED VIEWS — a person's own, and the shared ones ADMIN sets
 * ================================================================== */

export type SavedView = {
  readonly id: string;
  readonly list: ListKey;
  readonly name: string;
  readonly params: string;
  readonly shared: boolean;
  readonly mine: boolean;
  readonly may_retire: boolean;
};

type ViewRow = { id: string; list: string; name: string; params: string; shared: number; created_by: string; retired_at: string | null };

function viewObj(r: { id: string; created_by: string; shared: number | boolean }): Obj {
  return { type: 'saved_view', id: r.id, owner_id: r.created_by, shared: r.shared === true || r.shared === 1 };
}

export function viewsFor(db: Db, actor: Actor, list: ListKey): SavedView[] {
  return db.all<ViewRow>(
    'SELECT id, list, name, params, shared, created_by, retired_at FROM saved_views ' +
      'WHERE list = ? AND retired_at IS NULL AND (shared = 1 OR created_by = ?) ORDER BY shared DESC, name ASC, id ASC',
    [list, actor.id],
  ).map((r) => ({
    id: r.id, list, name: r.name, params: r.params, shared: r.shared === 1, mine: r.created_by === actor.id,
    may_retire: r.created_by === actor.id ? can(actor, 'saved_view.write', viewObj(r)) : r.shared === 1 && can(actor, 'saved_view.share', viewObj(r)),
  }));
}

/** The parameters of a view the reader may use — their own, or a shared one. Any other id looks like one that does not exist. */
export function viewParams(db: Db, actor: Actor, list: ListKey, id: string): URLSearchParams {
  const r = db.get<ViewRow>('SELECT id, list, name, params, shared, created_by, retired_at FROM saved_views WHERE id = ?', [id]);
  if (r === undefined || r.list !== list || r.retired_at !== null || (r.shared !== 1 && r.created_by !== actor.id)) throw new NotFoundAsRefusal();
  return new URLSearchParams(r.params);
}

export function saveView(
  d: ListDeps, actor: Actor, input: { list: string | null; name: string | null; shared: boolean; query: URLSearchParams },
): { ok: true; id: string; list: ListKey } | { ok: false; why: string } {
  const list = input.list === 'CLAIMS' || input.list === 'LEADS' ? input.list : null;
  if (list === null) return { ok: false, why: 'A view belongs to the claims list or the leads list.' };
  const probe = { type: 'saved_view' as const, id: '__new__', owner_id: actor.id, shared: input.shared };
  authorise(actor, 'saved_view.write', probe);
  if (input.shared) authorise(actor, 'saved_view.share', probe);
  const name = (input.name ?? '').trim();
  if (name.length === 0 || name.length > 120) return { ok: false, why: 'Give the view a name of up to 120 characters.' };
  const { params } = readParams(list, input.query);
  const id = d.newId();
  const at = d.now();
  d.db.tx(() => {
    d.db.run('INSERT INTO saved_views (id, list, name, params, shared, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, list, name, canonical(params), input.shared ? 1 : 0, actor.id, at]);
    d.audit.append({
      at, kind: 'SAVED_VIEW_CREATED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role, object_type: 'saved_view', object_id: id,
      detail: { list, shared: input.shared, filters: Object.keys(params.filters), sort: params.sort },
    });
  });
  return { ok: true, id, list };
}

export function retireView(d: ListDeps, actor: Actor, id: string): { ok: true; list: ListKey } | { ok: false; why: string } {
  const r = d.db.get<ViewRow>('SELECT id, list, name, params, shared, created_by, retired_at FROM saved_views WHERE id = ?', [id]);
  if (r === undefined || (r.shared !== 1 && r.created_by !== actor.id)) throw new NotFoundAsRefusal();
  authorise(actor, r.created_by === actor.id ? 'saved_view.write' : 'saved_view.share', viewObj(r));
  if (r.retired_at !== null) return { ok: false, why: 'That view has already been retired.' };
  const at = d.now();
  d.db.tx(() => {
    d.db.run('UPDATE saved_views SET retired_at = ?, retired_by = ? WHERE id = ?', [at, actor.id, id]);
    d.audit.append({
      at, kind: 'SAVED_VIEW_RETIRED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role, object_type: 'saved_view', object_id: id,
      detail: { list: r.list, shared: r.shared === 1 },
    });
  });
  return { ok: true, list: r.list === 'LEADS' ? 'LEADS' : 'CLAIMS' };
}

/* ================================================================== *
 * 5 · EXPORT — the reader's own columns, audited, formula injection neutralised
 * ================================================================== */

/** A cell a spreadsheet would read as a formula, or a control character that can start one. */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * ONE CSV CELL. A value beginning = + - @, a tab or a carriage return is prefixed with an apostrophe, so a
 * spreadsheet shows it as text rather than running it; then any cell holding a comma, a quote or a line break is
 * quoted, with its quotes doubled.
 */
export function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v);
  const safe = FORMULA_START.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const CLAIM_COLUMNS: Readonly<Record<ListShape, readonly (readonly [keyof ClaimListRow, string])[]>> = Object.freeze({
  MONEY: [['claim_ref', 'Reference'], ['client', 'Client'], ['opened', 'Opened']],
  WORKING: [['claim_ref', 'Reference'], ['client', 'Client'], ['property', 'Property'], ['workstream', 'Workstream'], ['stage', 'Stage'],
    ['owner', 'Owner'], ['priority', 'Priority'], ['next_action', 'Next action'], ['next_action_due', 'Next action due'],
    ['expected_completion', 'Expected completion'], ['opened', 'Opened']],
  VALUE: [['claim_ref', 'Reference'], ['client', 'Client'], ['property', 'Property'], ['workstream', 'Workstream'], ['stage', 'Stage'],
    ['owner', 'Owner'], ['priority', 'Priority'], ['next_action', 'Next action'], ['next_action_due', 'Next action due'],
    ['expected_completion', 'Expected completion'], ['opened', 'Opened'], ['shown_range', 'Estimated value — the range shown']],
});

const LEAD_COLUMNS: Readonly<Record<'WORKING' | 'VALUE', readonly (readonly [string, string])[]>> = Object.freeze({
  WORKING: [['organisation', 'Organisation'], ['source', 'Source'], ['origin', 'What made it a lead'], ['lead_date', 'Date'],
    ['owner', 'Owner'], ['priority', 'Priority'], ['status', 'Status'], ['next_action', 'Next action'], ['next_action_due', 'Next action due'],
    ['claim', 'Claim']],
  VALUE: [['organisation', 'Organisation'], ['source', 'Source'], ['origin', 'What made it a lead'], ['lead_date', 'Date'],
    ['owner', 'Owner'], ['priority', 'Priority'], ['status', 'Status'], ['next_action', 'Next action'], ['next_action_due', 'Next action due'],
    ['claim', 'Claim'], ['shown_range', 'Range shown']],
});

function cellOf(row: Readonly<Record<string, unknown>>, key: string): string {
  const v = row[key];
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    const o = v as { label?: unknown; claim_ref?: unknown };
    return typeof o.label === 'string' ? o.label : typeof o.claim_ref === 'string' ? o.claim_ref : '';
  }
  return String(v);
}

export type Export = { readonly filename: string; readonly body: string; readonly columns: readonly string[]; readonly rows: number };

export function exportList(d: ListDeps, actor: Actor, list: ListKey, q: URLSearchParams): Export {
  authorise(actor, 'list.export', EXPORT_OBJ);
  const { params, ignored } = readParams(list, q);
  const view = list === 'CLAIMS' ? claimsList(d.db, actor, params, ignored) : leadsList(d.db, actor, params, ignored);
  const columns = list === 'CLAIMS'
    ? CLAIM_COLUMNS[view.shape]
    : LEAD_COLUMNS[view.shape === 'VALUE' ? 'VALUE' : 'WORKING'];
  const lines = [
    columns.map(([, label]) => csvCell(label)).join(','),
    ...(view.rows as readonly Readonly<Record<string, unknown>>[]).map((r) => columns.map(([key]) => csvCell(cellOf(r, key as string))).join(',')),
  ];
  const at = d.now();
  d.audit.append({
    at, kind: 'LIST_EXPORTED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role, object_type: 'list', object_id: list,
    // THE CRM FOLLOW-ON: what the file does NOT apply of what was asked — the keys only, never a value.
    detail: {
      list, columns: columns.map(([key]) => key as string), rows: view.rows.length, filters: view.applied.map((x) => x.key), sort: view.sort.key,
      not_applied: view.not_applied,
    },
  });
  return {
    filename: `${list.toLowerCase()}-${localDate(at)}.csv`,
    body: `${lines.join('\r\n')}\r\n`,
    columns: columns.map(([key]) => key as string),
    rows: view.rows.length,
  };
}

/**
 * PHASE 133a — THE GATE OF THE CLAIMS LIST, EXPORTED FOR THE NAVIGATION. The same call its store function makes first;
 * src/web/navigation.ts asks it to decide whether the section is in a login's menu, and test/phase133a.test.ts opens
 * every menu link for every login, so a gate that drifted from its route fails there.
 */
export function claimListGate(actor: Actor): void {
  assertClaimList(actor);
}
