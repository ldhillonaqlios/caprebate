/**
 * PHASE 160i — WHERE THIS CLAIM STANDS, 20 October 2026. Lakhbir: "i want the back end CRM to be more human friendly ...
 * a list of all the stages, which stage we are on, what data we need, what data has been gathered and by where, and what
 * % the survayor pack has been completed ... anyone with no background of capital tax allowances can pick it up", then,
 * of the mock-up he chose (04-phase-work/mockups/claim-page-redesign.html): "we should be able to click on what API's or
 * humans have gathered and put in so user can click and see exactly where the information pull from".
 *
 * One block at the top of the claim page, read from the claim's own records and never invented:
 *   - every stage down the left, the ten in the procedure and Closed, each with what is in out of what it needs
 *     (gateOut, src/web/pipeline.ts); any stage opens with ?stage=, so staff can look back and ahead;
 *   - the stage in one plain sentence, who does it, and its needs, met and not;
 *   - still needed: the stage's unmet needs and what was asked of the client, late ones first;
 *   - gathered, grouped by where it came from: lookups (register_records, with exactly what came back, field by field,
 *     and who started the run), the claim's facts (claim_facts, append-only: who typed each value, when, how they got it
 *     and every value before), what the client answered, and documents;
 *   - the survey pack's progress, from the chapters the surveyor has gone through and their approval;
 *   - a short glossary.
 * Admin and Sales only: the pipeline is theirs (pipeline.read), and so are the facts. No script: the rail is links and
 * each source opens in place (<details>). Nothing here writes; every change is made by the forms below it, which audit.
 */
import type { Db } from '../db.ts';
import { can, type Actor } from '../authz.ts';
import { h, raw, type Safe } from './html.ts';
import { gateOut, loadPipelineClaim, type Need, type PipelineClaim } from './pipeline.ts';
import { CLOSED_STAGE, PROCEDURE_STAGES, claimStage, type ProcedureKey } from './stages.ts';
import { plainNeed } from './next-step.ts';
import { captured, latestFacts, type FactReading, type FactsPanel } from './claim-facts.ts';
import type { ClaimDocumentsPanel } from './documents.ts';
import { chaptersToRead, CHAPTERS } from './pack-chapters.ts';
import { localStamp, ukDate } from './localtime.ts';
import { clientAuditCount } from './audit-log.ts';
import { SOURCES as REGISTER_SOURCES } from '../../../../04-phase-work/phase3/caprebate-source-register.ts';

/* ================================================================== *
 * 1 · THE STAGES, IN PLAIN WORDS
 * ================================================================== */

/** What each stage is for and who does it, for someone new to capital allowances. The procedure's own words are in
 *  src/web/stages.ts; these say the same thing simply. */
export const STAGE_WORDS: Readonly<Record<ProcedureKey | 'CLOSED', { readonly plain: string; readonly who: string }>> = Object.freeze({
  ENQUIRY: { plain: 'Someone has asked us to look at their building. We check it is a healthcare building in the UK, and that they own it or act for the owner.', who: 'Sales' },
  ASSESSMENT: { plain: 'The client answers our questions online and sees an early figure. We check there is something worth claiming, and that they want to go ahead.', who: 'The client, then Sales' },
  ENGAGEMENT: { plain: 'The client signs our letter. Nothing else starts until it is signed.', who: 'The client, sent by Sales' },
  DATA_GATHERING: { plain: 'We collect the facts about the building and the business, from public records, the client and their accountant.', who: 'Our analyst, with the client and their accountant' },
  SURVEY: { plain: 'A chartered surveyor checks the building and writes down what is in it. Their figures decide the claim.', who: 'The chartered surveyor' },
  VALUATION: { plain: 'We price each part of the building. The surveyor checks the pricing and signs it.', who: 'Our analyst, signed by the surveyor' },
  TAX_ADVISER_SIGNOFF: { plain: 'A tax adviser checks the figure. The client is not told it can be claimed until the adviser signs it off.', who: 'The client’s accountant, or our tax adviser' },
  REPORTS: { plain: 'We send one report to the client and one to their accountant. The client accepts it, and the accountant confirms it fits the tax return.', who: 'Sales and our analyst' },
  INVOICE: { plain: 'Our fee is due, and we send the invoice while the claim is still in time.', who: 'Finance' },
  DEFENCE_PACK: { plain: 'Every record of the claim is kept together, in case HMRC asks questions later.', who: 'Our analyst. It is made at the end.' },
  CLOSED: { plain: 'The claim is finished.', who: 'Nobody: there is nothing left to do' },
});

export const GLOSSARY: readonly (readonly [term: string, means: string])[] = Object.freeze([
  ['Capital allowances', 'Tax relief a business gets on things built into its building, like heating, wiring, lifts and sinks.'],
  ['Early estimate', 'Our first figure, from the client’s answers. The real figure comes after the survey and the pricing.'],
  ['Chartered surveyor', 'A qualified surveyor who visits, measures and lists what is in the building.'],
  ['Survey pack', 'The surveyor’s report, in 23 chapters. The claim rests on it.'],
  ['Lookup', 'Facts we fetch from a public record, such as Companies House or HM Land Registry.'],
  ['Proof pack', 'Every record of the claim, kept together in case HMRC asks questions later.'],
]);

type StageKey = ProcedureKey | 'CLOSED';
const STAGE_KEYS: readonly StageKey[] = [...PROCEDURE_STAGES.map((s) => s.key), 'CLOSED'];

export type OverviewStage = {
  readonly key: StageKey;
  readonly n: number;
  readonly label: string;
  readonly state: 'DONE' | 'NOW' | 'LATER';
  readonly needs: readonly Need[];
};

/* ================================================================== *
 * 2 · WHAT IS GATHERED, AND WHERE FROM
 * ================================================================== */

export type GatheredGroup = 'LOOKUP' | 'CLIENT' | 'TEAM' | 'SURVEYOR' | 'ADVISER' | 'DOCUMENT';
export const GROUP_WORDS: Readonly<Record<GatheredGroup, string>> = Object.freeze({
  LOOKUP: 'From public records', CLIENT: 'From the client', TEAM: 'Recorded by our team',
  SURVEYOR: 'From the surveyor', ADVISER: 'From the tax adviser', DOCUMENT: 'Documents',
});

export type HistoryLine = { readonly value: string; readonly by: string; readonly at: string; readonly how: string; readonly note: string | null };

export type Gathered = {
  readonly group: GatheredGroup;
  readonly name: string;
  readonly value: string;
  /** Where it came from, in a few words, shown on the line. */
  readonly badge: string;
  /** Who, when and how, shown when the line is opened. */
  readonly source: readonly (readonly [string, string])[];
  /** A lookup's answer, exactly as it came back, field by field. */
  readonly fields?: readonly (readonly [string, string])[];
  /** Every value recorded for a fact, newest first. The old values are never overwritten. */
  readonly history?: readonly HistoryLine[];
  readonly href?: string;
};

/** How a recorded fact was obtained: the four sources a person may give (claim_facts.source_id). */
const FACT_SOURCES: Readonly<Record<string, { readonly group: GatheredGroup; readonly how: string }>> = Object.freeze({
  CLIENT_ANSWER: { group: 'CLIENT', how: 'The client told us' },
  CLIENT_DOC: { group: 'CLIENT', how: 'From a document the client gave us' },
  SURVEYOR: { group: 'SURVEYOR', how: 'The surveyor told us' },
  CTA: { group: 'ADVISER', how: 'The tax adviser told us' },
});

/** The plain name of a field a public record sends back. Unknown fields are said in words from their own name. */
const FIELD_WORDS: Readonly<Record<string, string>> = Object.freeze({
  company_name: 'Name', company_number: 'Company number', company_status: 'Status', sic_codes: 'Business type code',
  accounts_year_end: 'Year end (month and day)', incorporation_date: 'Set up on', registered_office: 'Registered office',
  epc_total_floor_area_m2: 'Floor area (m²)', epc_property_type: 'Type of building', epc_construction_age_band: 'Built',
  epc_tenure: 'How it is held', epc_lodgement_date: 'Certificate dated', epc_rrn: 'Certificate number',
  registration_status: 'Registration', beds_registered: 'Beds', regulated_activities: 'What it is registered to do',
  service_types: 'Services', registration_date: 'Registered on', cqc_location_id: 'Location number', cqc_provider_id: 'Provider number',
  price: 'Price paid', price_paid: 'Price paid', date_of_transfer: 'Date of sale', transfer_date: 'Date of sale',
  title_number: 'Title number', tenure: 'Tenure', postcode: 'Postcode', floor_area_m2: 'Floor area (m²)',
});

export function fieldWords(key: string): string {
  const k = FIELD_WORDS[key];
  if (k !== undefined) return k;
  const w = key.replace(/^epc_|^cqc_|^ch_/, '').replace(/_m2$/, ' (m²)').replace(/_/g, ' ').trim();
  return w.charAt(0).toUpperCase() + w.slice(1);
}

function fieldValue(key: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return 'none given';
  if (typeof v === 'string' && /date/.test(key) && /^\d{4}-\d{2}-\d{2}/.test(v)) return ukDate(v.slice(0, 10));
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

/** Each public record by the name a newcomer knows it by. The register's publisher is the fallback. */
const SOURCE_NAMES: Readonly<Record<string, string>> = Object.freeze({
  CH_COMPANY: 'Companies House', CH_PSC: 'Companies House, who controls the company', HMLR_PPD: 'HM Land Registry, prices paid',
  HMLR_TITLE: 'HM Land Registry, the title', HMLR_INSPIRE: 'HM Land Registry, the land boundary', CQC: 'Care Quality Commission',
  CIW: 'Care Inspectorate Wales', CARE_INSPECTORATE: 'Care Inspectorate Scotland', EPC: 'The energy certificate register',
  PLANNING: 'Planning records', BCIS: 'BCIS building costs', ONS_POSTCODE: 'The postcode directory', POSTCODES_IO: 'The postcode directory',
  HOMEDATA_ADDRESS: 'Homedata', HOMEDATA_BOUNDARY: 'Homedata, the site boundary', ENGINE: 'Our estimate',
});
/** The fields that sum a record up on its line, in order. Other records show their first field. */
const SUMMARY_FIELDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  CH_COMPANY: ['company_name', 'company_status'], EPC: ['epc_total_floor_area_m2', 'epc_property_type'],
  CQC: ['registration_status', 'service_types'], HMLR_PPD: ['price', 'price_paid', 'date_of_transfer', 'transfer_date'],
});

export function sourceName(source_id: string): string {
  return SOURCE_NAMES[source_id] ?? REGISTER_SOURCES.find((s) => s.source_id === source_id)?.publisher ?? 'a public record';
}

/** The lookups kept for this client: each record exactly as it came back, with who started the run that fetched it. */
export function lookups(db: Db, business_id: string, property_id: string | null): Gathered[] {
  const rows = db.all<{ source_id: string; entity_id: string; fields_json: string; obtained_at: string }>(
    'SELECT source_id, entity_id, fields_json, obtained_at FROM register_records WHERE business_id = ? ' +
      'AND (property_id IS NULL OR property_id = ? OR ? IS NULL) ORDER BY obtained_at DESC, rowid DESC',
    [business_id, property_id, property_id]);
  return rows.map((r) => {
    let fields: (readonly [string, string])[] = [];
    let summary = '';
    try {
      const o = JSON.parse(r.fields_json) as Record<string, unknown>;
      fields = Object.entries(o).map(([k, v]) => [fieldWords(k), fieldValue(k, v)] as const);
      const keys = (SUMMARY_FIELDS[r.source_id] ?? []).filter((k) => o[k] !== undefined && o[k] !== null && o[k] !== '');
      summary = keys.length > 0 ? keys.slice(0, 2).map((k) => `${fieldValue(k, o[k])}${k.endsWith('_m2') ? ' m²' : ''}`).join(', ') : (fields[0]?.[1] ?? '');
    } catch { fields = [['What came back', 'could not be read']]; }
    const run = db.get<{ who: string | null; at: string }>(
      'SELECT u.display_name AS who, r.at FROM research_runs r LEFT JOIN users u ON u.id = r.actor_id ' +
        'WHERE r.business_id = ? AND r.at <= ? ORDER BY r.at DESC LIMIT 1', [business_id, r.obtained_at]);
    const byHand = r.entity_id.startsWith('by-hand:');
    const name = sourceName(r.source_id);
    return {
      group: 'LOOKUP', name, value: summary,
      badge: byHand ? `Typed in from ${name}` : `Lookup: ${name}`,
      source: [
        ['Where from', name],
        ['Record', byHand ? 'Typed in by hand from the record' : r.entity_id],
        ['When', localStamp(r.obtained_at)],
        ['Started by', run === undefined ? 'Kept when this client was set up' : `${run.who ?? 'a former user'}, ${localStamp(run.at)}`],
      ],
      fields,
    } satisfies Gathered;
  });
}

type FactRowOf = ReturnType<typeof latestFacts> extends Map<string, infer R> ? R : never;

/** Every value recorded for one fact on this claim, newest first, each read as the facts panel reads it. */
export function factHistory(db: Db, claim_id: string, key: string): HistoryLine[] {
  const rows = db.all<FactRowOf>(
    'SELECT f.id, f.fact_key, f.answer, f.value_text, f.value_pence, f.value_date, f.source_id, f.note, f.recorded_at, ' +
      'u.display_name AS recorder FROM claim_facts f LEFT JOIN users u ON u.id = f.recorded_by ' +
      'WHERE f.claim_id = ? AND f.fact_key = ? ORDER BY f.recorded_at DESC, f.rowid DESC', [claim_id, key]);
  return rows.map((r) => {
    const read = captured(new Map([[key, r]]), key);
    return {
      value: read.known ? read.display : 'Not known', by: r.recorder ?? 'a former user', at: localStamp(r.recorded_at),
      how: FACT_SOURCES[r.source_id]?.how ?? 'Recorded by our team', note: r.note,
    };
  });
}

/** The facts the claim page shows, flattened. */
function factReadings(f: FactsPanel): readonly FactReading[] {
  return [
    f.claimant_type, f.jurisdiction, f.acquisition_date, f.accounting_period.start, f.accounting_period.end,
    f.partnership_company_member, f.taxable_profit.sufficient_profit, f.allowance_headroom.position, f.allowance_headroom.amount,
    f.pool_split.main, f.pool_split.special, f.structures_and_buildings.qualifying_expenditure,
    f.election.exists, f.election.section, f.election.notified_on, f.election.value, f.election.elements,
    f.grants.exist, f.grants.provider_checked, f.grants.split_view,
    f.acquisition_costs.costs, f.acquisition_costs.transaction_tax, f.buyer_alterations.made, f.buyer_alterations.amount,
  ];
}

/** The claim's facts that are known, each with who recorded it, how they got it, and every value before. */
export function factsGathered(db: Db, claim_id: string, f: FactsPanel): Gathered[] {
  const out: Gathered[] = [];
  const seen = new Set<string>();
  for (const r of factReadings(f)) {
    if (!r.known || r.source === null || seen.has(r.key)) continue;
    seen.add(r.key);
    const s = r.source;
    const how = s.source_id === null ? null : FACT_SOURCES[s.source_id];
    const history = how === undefined || how === null ? [] : factHistory(db, claim_id, r.key);
    const group: GatheredGroup = how?.group ?? (s.publisher === 'Cap Rebate staff' ? 'TEAM' : s.source_id !== null ? 'LOOKUP' : 'TEAM');
    const latest = history[0];
    out.push({
      group, name: r.label, value: r.display,
      badge: how !== undefined && how !== null ? `Typed in by ${s.recorded_by ?? 'our team'}` : s.publisher === 'Cap Rebate staff' ? 'Recorded by our team'
        : s.derived ? `Worked out from ${sourceName(s.source_id ?? '')}` : sourceName(s.source_id ?? ''),
      source: [
        ['How we got it', how?.how ?? (s.publisher === 'Cap Rebate staff' ? `Recorded by our team, on ${s.locator}` : s.derived ? `Worked out from ${sourceName(s.source_id ?? '')}` : `From ${sourceName(s.source_id ?? '')}`)],
        ...(s.recorded_by === null ? [] : [['Typed in by', s.recorded_by] as const]),
        ...(s.recorded_at === null ? [] : [['When', s.recorded_at] as const]),
        ...(latest?.note === null || latest?.note === undefined || latest.note.trim() === '' ? [] : [['Their note', latest.note] as const]),
      ],
      ...(history.length > 0 ? { history } : {}),
      href: '#record-fact',
    });
  }
  return out;
}

/** What the client answered in their portal, or what our team recorded for them, on this claim or the company. */
export function answersGathered(db: Db, business_id: string, claim_id: string): Gathered[] {
  return db.all<{ question: string; answer: string | null; answer_state: string; answered_at: string; role: string; who: string | null }>(
    "SELECT t.question, t.answer, t.answer_state, t.answered_at, t.answered_by_role AS role, u.display_name AS who FROM client_tasks t " +
      "LEFT JOIN users u ON u.id = t.answered_by WHERE t.business_id = ? AND t.state = 'ANSWERED' AND t.kind = 'QUESTION' " +
      'AND (t.claim_id = ? OR t.claim_id IS NULL) ORDER BY t.answered_at DESC', [business_id, claim_id],
  ).map((t) => ({
    group: t.role === 'CLIENT' ? 'CLIENT' : 'TEAM', name: t.question,
    value: t.answer_state === 'DONT_KNOW' ? 'They do not know' : (t.answer ?? ''),
    badge: t.role === 'CLIENT' ? 'Answered in the client portal' : `Recorded by ${t.who ?? 'our team'}`,
    source: [
      ['How we got it', t.role === 'CLIENT' ? 'The client answered in their portal' : 'Our team recorded the answer'],
      ['Who', t.who ?? (t.role === 'CLIENT' ? 'the client' : 'a former user')],
      ['When', localStamp(t.answered_at)],
    ],
  } satisfies Gathered));
}

export function documentsGathered(d: ClaimDocumentsPanel): Gathered[] {
  return d.documents.filter((x) => x.current !== null && x.current.received).map((x) => ({
    group: 'DOCUMENT', name: x.label, value: x.versions > 1 ? `${x.versions} versions` : 'One version',
    badge: `Uploaded by ${x.current?.by ?? 'someone'}`,
    source: [
      ['Uploaded by', x.current?.by ?? 'someone'],
      ['When', x.current?.uploaded ?? ''],
      ['Who may read it', x.readers],
    ],
    href: x.href,
  } satisfies Gathered));
}

/* ================================================================== *
 * 3 · WHAT IS STILL NEEDED
 * ================================================================== */

export type StillNeeded = {
  readonly name: string;
  readonly state: 'LATE' | 'ASKED' | 'NEEDED';
  readonly meta: string;
  readonly fix: { readonly href: string; readonly label: string } | null;
};

/** What was asked of the client and is not back yet, on this claim or the whole company: by due date, so late first. */
export function openAsks(db: Db, business_id: string, claim_id: string, today: string): StillNeeded[] {
  return db.all<{ question: string; kind: string; due_on: string | null; created_at: string; sent: string | null }>(
    "SELECT question, kind, due_on, created_at, sent_to_portal_at AS sent FROM client_tasks WHERE business_id = ? AND state = 'OPEN' " +
      'AND (claim_id = ? OR claim_id IS NULL) ORDER BY due_on IS NULL, due_on ASC, created_at ASC', [business_id, claim_id],
  ).map((t) => {
    const late = t.due_on !== null && t.due_on < today;
    return {
      name: t.question, state: late ? 'LATE' : 'ASKED',
      meta: `${t.kind === 'DOCUMENT' ? 'A document' : 'A question'} for the client${t.sent === null ? '' : ', in their portal'}. Asked ${ukDate(t.created_at.slice(0, 10))}${t.due_on === null ? '' : `, due ${ukDate(t.due_on)}`}.`,
      fix: { href: t.kind === 'DOCUMENT' ? '#claim-documents' : '#claim-facts', label: late ? 'Chase it' : 'See it' },
    } satisfies StillNeeded;
  });
}

/* ================================================================== *
 * 4 · THE SURVEY PACK'S PROGRESS
 * ================================================================== */

export type PackProgress = {
  readonly job_id: string;
  readonly surveyor: string | null;
  readonly done: readonly number[];
  readonly approved: boolean;
  readonly percent: number;
};

/** How far the surveyor has gone through the survey pack: each built chapter they have opened (the legal check again
 *  since anyone else last answered it, as readiness() reads it), and chapter 23, the signature, once it is approved. */
export function packProgress(db: Db, claim_id: string): PackProgress | null {
  const job = db.get<{ id: string; surveyor_id: string | null; who: string | null }>(
    'SELECT j.id, j.surveyor_id, u.display_name AS who FROM surveyor_jobs j LEFT JOIN users u ON u.id = j.surveyor_id ' +
      'WHERE j.claim_id = ? ORDER BY j.created_at DESC LIMIT 1', [claim_id]);
  if (job === undefined) return null;
  const pack = db.get<{ id: string }>('SELECT id FROM survey_packs WHERE job_id = ?', [job.id]);
  const approved = pack !== undefined && db.get<{ n: number }>('SELECT COUNT(*) AS n FROM survey_pack_approvals WHERE pack_id = ?', [pack.id])?.n !== 0;
  const reads = job.surveyor_id === null ? [] : db.all<{ chapter: number; seq: number }>(
    'SELECT chapter, MAX(legal_seq) AS seq FROM survey_pack_reads WHERE job_id = ? AND user_id = ? GROUP BY chapter', [job.id, job.surveyor_id]);
  const othersLegal = pack === undefined || job.surveyor_id === null ? 0 : db.get<{ s: number | null }>(
    'SELECT MAX(seq) AS s FROM survey_pack_legal_answers WHERE pack_id = ? AND by_user <> ?', [pack.id, job.surveyor_id])?.s ?? 0;
  const readAt = new Map(reads.map((r) => [r.chapter, r.seq] as const));
  const done = approved ? CHAPTERS.map((c) => c.n)
    : chaptersToRead().filter((c) => readAt.has(c) && !(c === 7 && (readAt.get(c) ?? -1) < othersLegal));
  return { job_id: job.id, surveyor: job.who, done, approved, percent: Math.round((done.length / CHAPTERS.length) * 100) };
}

/* ================================================================== *
 * 5 · THE WHOLE BLOCK
 * ================================================================== */

/** A reason as a sentence: a capital first letter and a full stop. */
export function sentence(s: string): string {
  const t = s.trim();
  if (t === '') return t;
  return `${t.charAt(0).toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? '' : '.'}`;
}

export type ClaimOverview = {
  readonly stages: readonly OverviewStage[];
  readonly viewing: OverviewStage;
  readonly stopped: string | null;
  readonly on_hold: boolean;
  readonly needed: readonly StillNeeded[];
  readonly gathered: readonly Gathered[];
  readonly pack: PackProgress | null;
  readonly may_read_audit: boolean;
  readonly audit_entries: number;
};

/** The stages of one claim, each with its needs as the gates read them now. A gate that cannot be read says nothing. */
export function overviewStages(db: Db, c: PipelineClaim, today: string): { stages: OverviewStage[]; stopped: string | null; on_hold: boolean } {
  const s = claimStage(c.stage);
  const effective = s.kind === 'ON_HOLD' ? c.hold_return_stage : c.stage;
  const at = s.kind === 'CLOSED' ? STAGE_KEYS.length - 1 : STAGE_KEYS.indexOf((effective ?? '') as StageKey);
  const stages = STAGE_KEYS.map((key, i): OverviewStage => {
    let needs: readonly Need[] = [];
    if (key !== 'CLOSED') { try { needs = gateOut(db, c, key, { today }).needs; } catch { needs = []; } }
    return {
      key, n: i + 1, label: key === 'CLOSED' ? CLOSED_STAGE.label : (PROCEDURE_STAGES.find((p) => p.key === key)?.label ?? key),
      state: at < 0 ? 'LATER' : i < at ? 'DONE' : i === at ? (key === 'CLOSED' ? 'DONE' : 'NOW') : 'LATER', needs,
    };
  });
  return { stages, stopped: s.kind === 'EXIT' ? s.label : null, on_hold: s.kind === 'ON_HOLD' };
}

export function claimOverview(
  db: Db, actor: Actor,
  v: { readonly id: string; readonly business_id: string; readonly property_id: string | null; readonly facts: FactsPanel; readonly documents: ClaimDocumentsPanel },
  asked: string | null, today: string,
): ClaimOverview | null {
  if (!can(actor, 'pipeline.read', { type: 'pipeline', id: v.id })) return null;
  const c = loadPipelineClaim(db, v.id);
  const { stages, stopped, on_hold } = overviewStages(db, c, today);
  const now = stages.find((s) => s.state === 'NOW') ?? stages[stages.length - 1] ?? stages[0];
  if (now === undefined) return null;
  const viewing = stages.find((s) => s.key === asked) ?? now;
  const unmet: StillNeeded[] = viewing.state === 'DONE' ? [] : viewing.needs.filter((n) => !n.met).map((n) => {
    const p = plainNeed(n.what);
    return { name: p.words, state: 'NEEDED', meta: viewing.state === 'LATER' ? 'Needed at this stage, once it starts.' : sentence(n.why), fix: viewing.state === 'NOW' ? p.fix : null };
  });
  const needed = viewing.state === 'NOW' ? [...openAsks(db, v.business_id, v.id, today), ...unmet] : unmet;
  const gathered = [
    ...lookups(db, v.business_id, v.property_id), ...factsGathered(db, v.id, v.facts),
    ...answersGathered(db, v.business_id, v.id), ...documentsGathered(v.documents),
  ];
  const mayAudit = can(actor, 'audit.read', { type: 'audit', id: 'audit_log' });
  return {
    stages, viewing, stopped, on_hold, needed, gathered, pack: packProgress(db, v.id), may_read_audit: mayAudit,
    audit_entries: mayAudit ? clientAuditCount(db, v.business_id) : 0,
  };
}

/* ================================================================== *
 * 6 · DRAWING IT
 * ================================================================== */

function stageIcon(s: OverviewStage): Safe {
  return s.state === 'DONE' ? raw('<span class="cov-ic done" aria-hidden="true">✓</span>')
    : s.state === 'NOW' ? raw('<span class="cov-ic now" aria-hidden="true">▶</span>')
      : h`<span class="cov-ic" aria-hidden="true">${String(s.n)}</span>`;
}

function count(s: OverviewStage): string {
  // A stage the claim has passed shows its tick; what it needed is listed when it is opened.
  if (s.needs.length === 0 || s.state === 'DONE') return '';
  return `${s.needs.filter((n) => n.met).length}/${s.needs.length}`;
}

function gatheredLine(g: Gathered): Safe {
  return h`<details class="cov-got"><summary><span class="cov-tick" aria-hidden="true">✓</span>
      <span class="cov-gname">${g.name}</span><span class="cov-gval">${g.value}</span>
      <span class="cov-src cov-src-${g.group.toLowerCase()}">${g.badge}</span></summary>
    <div class="cov-where">
      <h4>Where it came from</h4>
      <dl class="cov-kv">${g.source.map(([k, val]) => h`<dt>${k}</dt><dd>${val}</dd>`)}</dl>
      ${g.fields === undefined || g.fields.length === 0 ? raw('') : h`<h4>Exactly what came back</h4>
        <table class="cov-fields"><tbody>${g.fields.map(([k, val]) => h`<tr><th scope="row">${k}</th><td>${val}</td></tr>`)}</tbody></table>`}
      ${g.history === undefined || g.history.length === 0 ? raw('') : h`<h4>Every value recorded, newest first</h4>
        <ol class="cov-hist">${g.history.map((x, i) => h`<li><strong>${x.value}</strong>${i === 0 ? h` <span class="cov-now">now</span>` : raw('')}
          <br><span class="help">${x.by}, ${x.at}. ${x.how}.${x.note === null || x.note.trim() === '' ? '' : ` Note: ${x.note}`}</span></li>`)}</ol>
        <p class="help">A new value never replaces an old one: each stays here and in the audit log.</p>`}
      ${g.href === undefined ? raw('') : h`<p><a href="${g.href}">${g.group === 'DOCUMENT' ? 'Open the document' : 'Change or correct it'}</a></p>`}
    </div></details>`;
}

export function overviewBlock(o: ClaimOverview, base: string, business_id: string): Safe {
  const v = o.viewing;
  const words = STAGE_WORDS[v.key];
  const now = o.stages.find((s) => s.state === 'NOW');
  const late = o.needed.filter((n) => n.state === 'LATE').length;
  const groups = (Object.keys(GROUP_WORDS) as GatheredGroup[]).map((g) => [g, o.gathered.filter((x) => x.group === g)] as const).filter(([, xs]) => xs.length > 0);
  const tag = v.state === 'DONE' ? h`<span class="badge b-ok">Done</span>`
    : v.state === 'NOW' ? (o.needed.length === 0 ? h`<span class="badge b-ok">Ready to move on</span>` : h`<span class="badge b-warn">${String(o.needed.length)} still needed</span>`)
      : h`<span class="badge">Not started yet</span>`;
  const pack = o.pack;
  return h`<section class="cov" id="where" aria-labelledby="cov-h">
    <div class="cov-head"><h2 id="cov-h">Where this claim stands</h2>
      <p class="cov-sum">${o.stopped !== null ? `This claim stopped: ${o.stopped}.`
        : now === undefined ? 'The claim is closed.' : `Stage ${now.n} of ${o.stages.length}: ${now.label}${o.on_hold ? ', on hold' : ''}.`}
        ${late > 0 ? h` <span class="badge b-stop">${String(late)} late</span>` : raw('')}
        ${pack === null ? raw('') : h` Survey pack ${String(pack.percent)}% done.`}</p></div>
    <div class="cov-grid">
      <nav class="cov-rail" aria-label="The stages of this claim"><ol>
        ${o.stages.map((s) => h`<li><a href="${base}?stage=${s.key}#where" class="cov-st cov-${s.state.toLowerCase()}"${s.key === v.key ? raw(' aria-current="true"') : raw('')}>
          ${stageIcon(s)}<span class="cov-stn">${s.label}${s.state === 'NOW' ? h` <span class="cov-nowtag">Now</span>` : raw('')}</span><span class="cov-cnt">${count(s)}</span></a></li>`)}
      </ol><p class="help">Pick any stage to see what it needs. The numbers show what is in, out of what it needs.</p></nav>
      <div class="cov-main">
        <div class="cov-stage">
          <div class="cov-stage-top"><h3>${String(v.n)}. ${v.label}${v.state === 'NOW' ? ': we are here' : ''}</h3>${tag}</div>
          <p>${words.plain}</p>
          <p class="help">Who does this: ${words.who}.</p>
          ${v.needs.length === 0 ? raw('') : h`<h4>What this stage needs</h4><ul class="cov-needs">${v.needs.map((n) => h`<li class="${n.met ? 'met' : 'unmet'}">
            <span aria-hidden="true">${n.met ? '✓' : '○'}</span> ${plainNeed(n.what).words}
            ${v.state === 'LATER' ? raw('') : h`<span class="help">${n.met ? sentence(n.why) : v.state === 'DONE' ? 'Not on record now.' : 'Not yet.'}</span>`}</li>`)}</ul>`}
          ${v.state !== 'NOW' && now !== undefined ? h`<p><a href="${base}?stage=${now.key}#where">Back to where we are</a></p>` : raw('')}
        </div>
        <div class="cov-cols">
          <section class="cov-col" aria-labelledby="cov-need-h"><h3 id="cov-need-h">Still needed <span class="count">${String(o.needed.length)}</span></h3>
            ${o.needed.length === 0 ? h`<p class="help">Nothing. Everything this stage needs is in.</p>`
              : h`<ul class="cov-list">${o.needed.map((n) => h`<li class="cov-need cov-${n.state.toLowerCase()}">
                <span class="cov-nname">${n.name}</span>${n.state === 'LATE' ? h` <span class="badge b-stop">Late</span>` : n.state === 'ASKED' ? h` <span class="badge b-warn">Asked</span>` : raw('')}
                <span class="help">${n.meta}</span>${n.fix === null ? raw('') : h` <a href="${n.fix.href}">${n.fix.label}</a>`}</li>`)}</ul>`}
          </section>
          <section class="cov-col" aria-labelledby="cov-got-h"><h3 id="cov-got-h">Gathered <span class="count">${String(o.gathered.length)}</span></h3>
            <p class="help">Open any line to see exactly where it came from, who added it and when.</p>
            ${groups.length === 0 ? h`<p class="help">Nothing gathered yet.</p>`
              : groups.map(([g, xs]) => h`<h4 class="cov-group">${GROUP_WORDS[g]}</h4>${xs.map(gatheredLine)}`)}
          </section>
        </div>
        <div class="cov-pack">
          <div class="cov-pack-top"><h3>Survey pack</h3>${pack === null ? raw('') : h`<span class="cov-pct">${String(pack.percent)}%</span>`}</div>
          ${pack === null ? h`<p class="help">No survey job yet. The surveyor’s report starts at the survey stage.</p>` : h`
            <div class="cov-bar" role="img" aria-label="${`${pack.done.length} of ${CHAPTERS.length} chapters done`}"><span class="cov-bar-${String(Math.min(100, Math.round(pack.percent / 5) * 5))}"></span></div>
            <p class="help">${pack.approved ? `Approved and signed by ${pack.surveyor ?? 'the surveyor'}.` : `${pack.done.length} of ${CHAPTERS.length} chapters gone through by ${pack.surveyor ?? 'the surveyor'}. The last, the signature, comes with their approval.`}</p>
            <ol class="cov-tiles">${CHAPTERS.map((c) => h`<li class="${pack.done.includes(c.n) ? 'done' : 'todo'}"><span>${String(c.n)}</span> ${c.title}</li>`)}</ol>
            <p><a href="/staff/survey/${pack.job_id}/pack">Open the survey pack</a></p>`}
        </div>
        ${o.may_read_audit ? h`<div class="cov-audit"><h3>The audit log for this client</h3>
          <p>${String(o.audit_entries)} entries. Every change is written there with who made it and when. Nobody can change or delete an entry, Admin included.</p>
          <p><a href="/staff/audit?client=${business_id}">Open the audit log for this client</a></p></div>` : raw('')}
        <details class="cov-gloss"><summary>New to capital allowances? The words on this page</summary>
          <dl>${GLOSSARY.map(([t, m]) => h`<dt>${t}</dt><dd>${m}</dd>`)}</dl></details>
      </div>
    </div>
  </section>`;
}
