/**
 * THE SURVEY PACK'S LEGAL CHECK — can the client claim on these fixtures at all? 2 October 2026.
 *
 * Lakhbir, 1 October 2026, agreeing that the legal check comes before the survey: on a building bought from an owner
 * who could claim, the buyer's claim on the fixtures can be worth nothing unless the value was fixed — a section 198
 * election, or a tribunal application, within two years (CAA 2001 s.187A) — however good the survey is.
 *
 * THE LAW IS THE ENGINE'S, NOT THIS FILE'S. The questions are the sector's own (its "What happened" and "History of …"
 * groups, built by CB_S187A.questions and the election questions), chosen by WHICH FACTS THEY SET, so the five sectors'
 * question sets are read the same way without a list of ids to keep in step. The answers are replayed through each
 * question's own `showIf` and `onSet`, in the sector's order, exactly as the engine's flow does; then the engine's two
 * assessments, CB_ELECTION.assess and CB_S187A.assess, give the position. This file only turns that into a verdict:
 *
 *   GREEN    the rules do not reach this claim, or they are met (OFF, SATISFIED; no election, or a complete one).
 *   URGENT   there is still time to fix the value — the claim can go ahead, and the deadline is shown (LIVE).
 *   AMBER    not known yet: a question unanswered, or a position the engine cannot settle (INDET). Blocks approval.
 *   RED      the claim on these fixtures fails (NIL, or a nominal election over the fixtures generally). Blocks it.
 *
 * "NOT KNOWN" IS NEVER A PASS (the engine's own rule, kept): an unanswered question is AMBER, and "not sure" is an
 * answer the engine treats as unknown. Where an election or a disposal value statement caps the claim, the cap is
 * returned, and the pack may not be approved above it (stage 3).
 */
import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { authorise, can, type Actor } from '../authz.ts';
import { CB, getSector, newSession } from './engine.ts';
import { packJob } from './surveyor.ts';
import { packView, type PackDeps, type PackResult } from './survey-pack.ts';
import { poundsWords } from './pack-sums.ts';
import { claimantTypeForGate } from './crm.ts';
import { valuationLock } from './valuation-lock.ts';

export type EngineQuestion = {
  readonly id: string;
  readonly group: string;
  readonly type: string;
  readonly ask: string;
  readonly help?: string;
  readonly opts?: readonly (readonly [string, string])[];
  readonly showIf?: (s: Record<string, unknown>) => unknown;
  readonly onSet?: (s: Record<string, unknown>, v: unknown) => void;
  readonly optional?: boolean;
};

/** The facts that decide the legal check. A question that sets one of these is asked. */
const LEGAL_FACT = /^(trigger|deal|event_date|acquisition_date|prior_owner_(claimed|entitled|s35_barred)|earlier_entitled_owner|election(_[a-z0-9_]+)?|s183_election_made|past_owner_[a-z0-9_]+|intervening_owner[a-z0-9_]*|dvs_[a-z_]+|s187a_8_statements|tribunal_[a-z_]+|seller_pre_2008|fvr_window_closed)$/;

/** The facts each question sets, found by setting it once on a scratch session (a sample answer for its type). */
function factsSetBy(q: EngineQuestion): string[] {
  const keys = new Set<string>();
  const scratch = new Proxy<Record<string, unknown>>({ flags: [], assumptions: [], trigger: [] }, {
    set(t, k, v) { keys.add(String(k)); t[String(k)] = v; return true; },
  });
  const sample = q.type === 'single' ? q.opts?.[0]?.[0] : q.type === 'multi' ? [q.opts?.[0]?.[0]] : q.type === 'date' ? '2020-01-01' : 1000;
  try { q.onSet?.(scratch, sample); } catch { /* a question that throws on a sample sets nothing we can read */ }
  keys.delete('flags');
  keys.delete('assumptions');
  return [...keys];
}

const cache = new Map<string, readonly EngineQuestion[]>();
/** The legal check's questions for a sector, in the sector's own order. */
export function legalQuestions(sector: string): readonly EngineQuestion[] {
  const hit = cache.get(sector);
  if (hit !== undefined) return hit;
  let all: readonly EngineQuestion[] = [];
  try { all = (getSector(sector as never) as unknown as { Q: readonly EngineQuestion[] }).Q ?? []; } catch { all = []; }
  const picked = Object.freeze(all.filter((q) => factsSetBy(q).some((k) => LEGAL_FACT.test(k))));
  cache.set(sector, picked);
  return picked;
}

export type LegalAnswer = {
  readonly question_id: string; readonly value: unknown; readonly by_name: string; readonly source_note: string; readonly at: string; readonly seq: number;
};

export type Level = 'GREEN' | 'URGENT' | 'AMBER' | 'RED';

export type LegalVerdict = {
  readonly level: Level;
  readonly headline: string;
  /** The engine's own reasons, in its words. */
  readonly why: readonly string[];
  readonly actions: readonly string[];
  /** A deadline to act by, where there is still time (YYYY-MM-DD). */
  readonly deadline: string | null;
  /** Where an election or a statement caps the claim on the fixtures: the cap, in pence. */
  readonly cap_pence: number | null;
  readonly cap_words: string | null;
};

export type LegalView = {
  readonly questions: readonly EngineQuestion[];
  /** The questions the flow asks now, given the answers so far, in order. */
  readonly asked: readonly EngineQuestion[];
  readonly unanswered: readonly EngineQuestion[];
  /** Answers given to questions the flow no longer asks (an earlier answer changed). Kept, and not used. */
  readonly not_asked_now: readonly LegalAnswer[];
  readonly answers: ReadonlyMap<string, LegalAnswer>;
  readonly history: readonly LegalAnswer[];
  readonly verdict: LegalVerdict;
  readonly seq: number;
  readonly may_answer: boolean;
};

type Outcome = { outcome: string; why?: string; action?: string | null; value?: unknown; window?: { deadline?: Date | null } | null; scope?: { mode?: string } };

function iso(d: unknown): string | null {
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}

function poundsToPence(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null;
}

/**
 * The engine's claimant type. Unknown is read as a company: its earlier start date never relieves (CB_S187A).
 * PHASE 157c (the Friary House run, F15): read as every other gate reads it (claimantTypeForGate) - the client's own
 * answer at the assessment first, then what staff recorded. It read only the recorded column, so a partnership that
 * said so at the assessment was checked on a company's dates.
 */
export function claimantFor(db: Db, business_id: string): string {
  const t = claimantTypeForGate(db, business_id).value;
  return t === null || t === 'COMPANY' || t === 'UNKNOWN' ? 'company' : t.toLowerCase();
}

/**
 * Replay the answers through the sector's own flow and ask the engine. Pure: the same answers and the same day give
 * the same verdict.
 */
export function assessLegal(sector: string, answers: ReadonlyMap<string, unknown>, nowIso: string, claimant: string): {
  asked: EngineQuestion[]; unanswered: EngineQuestion[]; verdict: LegalVerdict;
} {
  const qs = legalQuestions(sector);
  const base = newSession(sector as never) as unknown as Record<string, unknown>;
  const s: Record<string, unknown> = { ...base, trigger: [], flags: [], assumptions: [], __now: nowIso, claimant_type: claimant };
  const asked: EngineQuestion[] = [];
  const unanswered: EngineQuestion[] = [];
  for (const q of qs) {
    let visible = true;
    try { visible = q.showIf === undefined ? true : Boolean(q.showIf(s)); } catch { visible = false; }
    if (!visible) continue;
    asked.push(q);
    if (!answers.has(q.id)) { if (q.optional !== true) unanswered.push(q); continue; }
    try { q.onSet?.(s, answers.get(q.id)); } catch { unanswered.push(q); }
  }
  const verdict = ((): LegalVerdict => {
    const none = { deadline: null, cap_pence: null, cap_words: null };
    if (qs.length === 0) return { level: 'AMBER', headline: 'We have no legal questions for this kind of building.', why: [], actions: ['Ask a tax adviser.'], ...none };
    const trigger = Array.isArray(s['trigger']) ? s['trigger'] as string[] : [];
    if (unanswered.length > 0) {
      return { level: 'AMBER', headline: `${unanswered.length} question${unanswered.length === 1 ? '' : 's'} still to answer. Not known is never a pass.`, why: [], actions: [], ...none };
    }
    if (!trigger.includes('purchase')) {
      return { level: 'GREEN', headline: 'These rules are about buying a building. This claim is for building or fitting out, so they do not apply.', why: [], actions: [], ...none };
    }
    const deal = s['deal'];
    if (deal === 'shares') return { level: 'GREEN', headline: 'The company’s shares were bought, not the building. The building did not change hands, so these rules do not apply.', why: [], actions: [], ...none };
    if (deal !== 'property' && deal !== 'buyin') return { level: 'AMBER', headline: 'Find out whether the building itself, or a company’s shares, were bought.', why: [], actions: [], ...none };

    const el = (CB as unknown as { CB_ELECTION: { assess: (s: unknown) => Outcome; electionDeadline: (s: unknown) => Date | null; OUT: Record<string, string> } }).CB_ELECTION;
    const fx = (CB as unknown as { CB_S187A: { assess: (s: unknown) => Outcome; OUT: Record<string, string> } }).CB_S187A;
    let e: Outcome, a: Outcome;
    // The election is only assessed where the flow asked about one. Where nobody in the history could claim, the
    // flow does not ask, and "no notice produced" would be a question nobody needs answered.
    const electionAsked = s['election_document'] !== undefined;
    try { e = electionAsked ? el.assess({ ...s }) : { outcome: el.OUT['NONE'] ?? 'NONE' }; a = fx.assess({ ...s }); } catch {
      return { level: 'AMBER', headline: 'The engine could not read these answers. A tax adviser must look.', why: [], actions: [], ...none };
    }
    const why = [e.why, a.why].filter((x): x is string => typeof x === 'string' && x !== '');
    const actions = [e.action, a.action].filter((x): x is string => typeof x === 'string' && x !== '');
    const red = e.outcome === el.OUT['NIL'] || a.outcome === fx.OUT['NIL']
      || (e.outcome === el.OUT['NOMINAL'] && e.scope?.mode !== 'listed_items');
    if (red) return { level: 'RED', headline: 'On these answers, the claim on the fixtures fails.', why, actions, ...none };
    if (e.outcome === el.OUT['NOMINAL']) {
      return { level: 'AMBER', headline: 'The election fixes the items it lists at a nominal value. Take those items out of the pack before it can be approved.', why, actions, ...none };
    }
    if (e.outcome === el.OUT['INDET'] || a.outcome === fx.OUT['INDET']) {
      return { level: 'AMBER', headline: 'The position cannot be settled on what is known. It needs a specialist or a tax adviser.', why, actions, ...none };
    }
    // A cap from a complete election over the fixtures generally, or from a disposal value statement.
    let cap: number | null = null;
    let cap_words: string | null = null;
    if (e.outcome === el.OUT['CAP_ELECT']) {
      const mode = e.scope?.mode;
      /* PHASE 153b (Word question 98): with CB_CTA.election_value_cut_to_lawful_max on, the engine has already cut an
         elected figure above what the seller paid, or above the price, down to that limit; the cap says so. */
      const cut = (e as { cut?: { applied?: boolean; by?: { words?: string } } | null }).cut;
      if (mode === 'all_fixtures') {
        cap = poundsToPence(e.value);
        cap_words = cut?.applied === true
          ? `the most the law lets the section 198 election fix: ${cut.by?.words ?? 'its limit'}, below the figure it states`
          : 'the value the section 198 election fixes for the fixtures';
      }
      else if (mode !== 'listed_items') return { level: 'AMBER', headline: 'Say what the election lists before the pack can be approved: it may fix the value of every fixture.', why, actions, ...none };
    }
    if (a.outcome === fx.OUT['CAP_DV']) {
      const v = poundsToPence(a.value);
      if (v !== null && (cap === null || v < cap)) { cap = v; cap_words = 'the value in the earlier owner’s written statement'; }
    }
    if (e.outcome === el.OUT['LIVE'] || a.outcome === fx.OUT['LIVE']) {
      const deadline = iso(a.window?.deadline ?? null) ?? iso(el.electionDeadline(s));
      return { level: 'URGENT', headline: `There is still time to fix the value${deadline === null ? '' : ` — by ${deadline}`}. The claim can go ahead, and someone must act before then.`,
        why, actions, deadline, cap_pence: cap, cap_words };
    }
    return { level: 'GREEN', headline: cap === null ? 'The purchase rules are met, or do not reach this claim.' : 'The purchase rules are met. The claim on the fixtures is capped.',
      why, actions, deadline: null, cap_pence: cap, cap_words };
  })();
  return { asked, unanswered, verdict };
}

/**
 * PHASE 159d: THE LEGAL CHECK FOR A CLAIM, read without a login — for the claim's routes (src/web/claim-route.ts) and
 * the gates that re-check a deadline (C9). The newest survey job on the claim, its pack's answers, today's verdict. Null
 * where the claim has no survey pack yet: no answer, and nothing is decided on it.
 */
export function legalVerdictForClaim(db: Db, claim_id: string, nowIso: string): LegalVerdict | null {
  const job = db.get<{ id: string }>('SELECT id FROM surveyor_jobs WHERE claim_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1', [claim_id]);
  return job === undefined ? null : legalVerdictForJob(db, job.id, nowIso);
}

/** The same for one survey job, by its id. */
export function legalVerdictForJob(db: Db, job_id: string, nowIso: string): LegalVerdict | null {
  const job = db.get<{ id: string; business_id: string }>('SELECT id, business_id FROM surveyor_jobs WHERE id = ?', [job_id]);
  if (job === undefined) return null;
  const pack = db.get<{ id: string }>('SELECT id FROM survey_packs WHERE job_id = ?', [job.id]);
  if (pack === undefined) return null;
  const sector = db.get<{ sector: string }>('SELECT sector FROM businesses WHERE id = ?', [job.business_id])?.sector ?? '';
  const values = new Map<string, unknown>();
  for (const r of db.all<{ question_id: string; value_json: string }>('SELECT question_id, value_json FROM survey_pack_legal_answers WHERE pack_id = ? ORDER BY seq ASC', [pack.id])) {
    values.set(r.question_id, JSON.parse(r.value_json) as unknown);
  }
  return assessLegal(sector, values, nowIso, claimantFor(db, job.business_id)).verdict;
}

/** May this pack be approved, as far as the legal check goes? (Stage 3 asks this.) */
export function legalAllows(v: LegalVerdict, qualifying_pence: number | null): { ok: boolean; why: string } {
  if (v.level === 'RED' || v.level === 'AMBER') return { ok: false, why: v.headline };
  if (v.cap_pence !== null && qualifying_pence !== null && qualifying_pence > v.cap_pence) {
    return { ok: false, why: `The pack’s figure is above ${v.cap_words ?? 'the cap'}. The claim on the fixtures cannot be more than that.` };
  }
  return { ok: true, why: v.headline };
}

/* ================================================================== *
 * READING AND ANSWERING
 * ================================================================== */

function mayAnswer(d: PackDeps, actor: Actor, job: { business_id: string }, commitObj: Parameters<typeof can>[2]): boolean {
  return can(actor, 'surveyor_job.commit', commitObj)
    || can(actor, 'claim_facts.record', { type: 'claim_facts', id: job.business_id, business_id: job.business_id } as never);
}

export function legalView(d: PackDeps, actor: Actor, job_id: string): LegalView {
  const { job, obj } = packJob(d.db, actor, job_id);
  const pack = d.db.get<{ id: string }>('SELECT id FROM survey_packs WHERE job_id = ?', [job.id]);
  const rows = pack === undefined ? [] : d.db.all<{ question_id: string; value_json: string; by_name: string; source_note: string; at: string; seq: number }>(
    'SELECT a.question_id, a.value_json, u.display_name AS by_name, a.source_note, a.at, a.seq FROM survey_pack_legal_answers a JOIN users u ON u.id = a.by_user WHERE a.pack_id = ? ORDER BY a.seq ASC',
    [pack.id]);
  const history: LegalAnswer[] = rows.map((r) => ({ question_id: r.question_id, value: JSON.parse(r.value_json) as unknown, by_name: r.by_name, source_note: r.source_note, at: r.at, seq: r.seq }));
  const answers = new Map<string, LegalAnswer>();
  for (const h of history) answers.set(h.question_id, h);
  const values = new Map<string, unknown>([...answers].map(([k, v]) => [k, v.value] as const));
  const r = assessLegal(job.sector, values, d.now(), claimantFor(d.db, job.business_id));
  const askedIds = new Set(r.asked.map((q) => q.id));
  return {
    questions: legalQuestions(job.sector), asked: r.asked, unanswered: r.unanswered,
    not_asked_now: [...answers.values()].filter((a) => !askedIds.has(a.question_id)),
    answers, history: [...history].reverse(), verdict: r.verdict,
    seq: history.length === 0 ? 0 : (history[history.length - 1] as LegalAnswer).seq,
    may_answer: mayAnswer(d, actor, job, obj),
  };
}

/** Read what was typed into the answer the engine takes, or say what is wrong with it. */
export function parseAnswer(q: EngineQuestion, raw: readonly string[]): { ok: true; value: unknown } | { ok: false; why: string } {
  const keys = new Set((q.opts ?? []).map((o) => o[0]));
  const first = (raw[0] ?? '').trim();
  switch (q.type) {
    case 'single':
      if (!keys.has(first)) return { ok: false, why: 'Choose one of the answers.' };
      return { ok: true, value: first };
    case 'multi': {
      const picked = raw.map((x) => x.trim()).filter((x) => x !== '');
      if (picked.some((x) => !keys.has(x))) return { ok: false, why: 'Choose from the answers given.' };
      return { ok: true, value: [...new Set(picked)] };
    }
    case 'date':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(first) || Number.isNaN(Date.parse(`${first}T12:00:00Z`))
        || new Date(`${first}T12:00:00Z`).toISOString().slice(0, 10) !== first) return { ok: false, why: 'Give a real date, for example 2024-06-30.' };
      if (first < '1900-01-01' || first > '2100-12-31') return { ok: false, why: 'That date is out of range.' };
      return { ok: true, value: first };
    case 'currency': {
      const s = first.replace(/[£,\s]/g, '');
      if (!/^\d{1,10}(\.\d{1,2})?$/.test(s)) return { ok: false, why: 'Give an amount in pounds, for example 250000.' };
      return { ok: true, value: Number(s) };
    }
    case 'percent': {
      const s = first.replace(/%$/, '');
      if (!/^\d{1,3}(\.\d{1,2})?$/.test(s) || Number(s) > 100) return { ok: false, why: 'Give a percentage from 0 to 100.' };
      return { ok: true, value: Number(s) };
    }
    default: return { ok: false, why: 'This kind of question cannot be answered here.' };
  }
}

/** Answer one question. It must be one the flow asks now; the answer says where it came from. */
export function answerLegal(d: PackDeps, actor: Actor, job_id: string, f: { question: string; values: readonly string[]; source: string; seq: string }): PackResult {
  const { job, obj } = packJob(d.db, actor, job_id);
  if (!mayAnswer(d, actor, job, obj)) authorise(actor, 'surveyor_job.commit', obj);
  // PHASE 159a (C3, L3): once the claim is past the tax adviser's sign-off, or has stopped, the legal check is fixed too.
  const lock = valuationLock(d.db, job.claim_id);
  if (lock.locked) return { ok: false, why: lock.why };
  const source = f.source.trim();
  if (source === '') return { ok: false, field: 'source', why: 'Say where this answer came from — for example the election notice, the CPSE replies, or the client.' };
  if (source.length > 300) return { ok: false, field: 'source', why: 'Keep it under 300 characters.' };
  if (!/^\d{1,9}$/.test(f.seq.trim())) return { ok: false, stale: true, why: 'This page is out of date.' };
  return d.db.tx(() => {
    const lv = legalView(d, actor, job_id);
    if (lv.seq !== Number(f.seq.trim())) return { ok: false, stale: true, why: 'The legal check changed since you opened it. It is shown again; answer again if it still applies.' };
    const q = lv.asked.find((x) => x.id === f.question);
    if (q === undefined) return { ok: false, field: 'question', why: 'That question is not asked on the answers so far.' };
    const p = parseAnswer(q, f.values);
    if (!p.ok) return { ok: false, field: 'answer', why: p.why };
    const prev = lv.answers.get(q.id);
    if (prev !== undefined && JSON.stringify(prev.value) === JSON.stringify(p.value)) return { ok: false, field: 'answer', why: 'That is already the answer. Nothing changed.' };
    const pv = packView(d, actor, job_id);
    if (pv.property === null) return { ok: false, field: 'property_id', why: 'Say which property this pack is for first.' };
    let pack_id = pv.pack_id;
    if (pack_id === null) {
      pack_id = d.newId();
      d.db.run('INSERT INTO survey_packs (id, job_id, property_id, created_at, created_by) VALUES (?, ?, ?, ?, ?)', [pack_id, job.id, pv.property.id, d.now(), actor.id]);
    }
    d.db.run(
      'INSERT INTO survey_pack_legal_answers (id, pack_id, seq, question_id, value_json, by_user, source_note, at) ' +
        'SELECT ?, ?, COALESCE(MAX(seq), 0) + 1, ?, ?, ?, ?, ? FROM survey_pack_legal_answers WHERE pack_id = ?',
      [d.newId(), pack_id, q.id, JSON.stringify(p.value), actor.id, source, d.now(), pack_id]);
    (d.audit as AuditLog).append({ at: d.now(), kind: 'SURVEY_PACK_CHANGED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'surveyor_job', object_id: job.id, detail: { what: 'legal', line: q.id, fields: 'answer' } });
    return { ok: true };
  });
}

/** An answer as words: the option's label, a list of labels, a date or an amount. */
export function answerWords(q: EngineQuestion, value: unknown): string {
  const label = (k: unknown) => q.opts?.find((o) => o[0] === k)?.[1] ?? String(k);
  if (Array.isArray(value)) return value.length === 0 ? 'none of these' : value.map(label).join('; ');
  if (q.type === 'currency' && typeof value === 'number') return poundsWords(Math.round(value * 100));
  if (q.type === 'percent' && typeof value === 'number') return `${String(value)}%`;
  return label(value);
}

