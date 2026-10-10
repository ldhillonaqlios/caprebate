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
import { claimantRole, type ClaimantRole } from './who-claims.ts';
import { LEGAL_ENGINE_SWITCHES } from './money-readings.ts';

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
const LEGAL_FACT = /^(trigger|deal|event_date|acquisition_date|prior_owner_(claimed|entitled|s35_barred)|earlier_entitled_owner|earlier_disposal_value|transaction_type|election(_[a-z0-9_]+)?|s183_election_made|past_owner_[a-z0-9_]+|intervening_owner[a-z0-9_]*|dvs_[a-z_]+|s187a_8_statements|tribunal_[a-z_]+|seller_pre_2008|fvr_window_closed)$/;
/* PHASE 159h (C7, C8): `earlier_disposal_value` (G12bv — the value fixed when an earlier owner sold on, the s.185 cap)
   and `transaction_type` (G14s — how the client took the property on) were missing, so neither was ever asked. */

/**
 * PHASE 159h, 10 October 2026 — READINGS BUILT ON OUR RECOMMENDATION AND SWITCHED ON IN TEST (Lakhbir, 29 September
 * 2026: build it, then ask). Each is a viability question to the tax adviser in the Word questions document (268-272).
 * Off, the legal check reads exactly as before Phase 159h on that point.
 */
export const LEGAL_READINGS = Object.freeze({
  /** C26 (engine switch E-8's reading): a landlord who let the building as homes was barred from claiming by s.35, so
   *  is not an owner "entitled to claim"; the check looks past them to an earlier owner, as for an NHS seller. */
  s35_seller_not_entitled: true,
  /** C28: a seller recorded as "a private individual / other" is asked whether it was a charity or another body that
   *  pays no UK tax; yes means it could never claim. */
  non_taxpayer_seller: true,
  /** C8: a new lease for a premium takes the lease route — with a joint s.183 election the fixtures pass to the tenant;
   *  with none, they stay the landlord's where the landlord could claim (s.183), and pass where it could not (s.184). */
  lease_route: true,
  /** C7: a non-entitled seller with an earlier owner who could claim — the claim is capped at the value fixed when that
   *  earlier owner sold on (s.185), and is not settled while that value is not known. */
  s185_earlier_cap: true,
  /** PHASE 159l (item 8, #9; Word question 284): the s.187A(6)(b) statements route — where an owner in between could
   *  never claim, two written statements fix the value with no deadline. The engine's CB_CTA.s187a_6b_statements_route,
   *  held on for the pack's legal check only (G14ivne and G14st8 are asked). */
  s187a_6b_statements_route: true,
  /** PHASE 159l (item 8, #10; Word question 285): the fixed value requirement needs a past owner who CLAIMED; a past
   *  owner known never to have claimed brings no disposal value, so the requirement does not bite. The engine's
   *  CB_CTA.fvr_requires_past_owner_claim, held on for the pack's legal check only. */
  fvr_requires_past_owner_claim: true,
} as const);

/** PHASE 159l (item 8): the engine's own switches the pack's legal check reads, by the reading that holds them. */
export { LEGAL_ENGINE_SWITCHES };
export type LegalEngineReadings = Readonly<Record<(typeof LEGAL_ENGINE_SWITCHES)[number], boolean>>;

/**
 * THE ENGINE'S TWO SWITCHES, HELD FOR ONE CALL (Phase 159l, item 8). CB_S187A.assess and the two questions' showIf read
 * CB_CTA as they run, so the pack sets them, runs the whole legal flow, and puts them back — in a finally, and
 * synchronously, so no other request ever sees them set. The public estimate never runs inside this, and keeps CB_CTA as
 * it ships (the site harness asserts it off).
 */
export function withLegalEngineReadings<T>(readings: LegalEngineReadings, fn: () => T): T {
  const cta = (CB as unknown as { CB_CTA: Record<string, unknown> }).CB_CTA;
  const was = LEGAL_ENGINE_SWITCHES.map((k) => [k, cta[k]] as const);
  for (const k of LEGAL_ENGINE_SWITCHES) cta[k] = readings[k];
  try { return fn(); } finally { for (const [k, v] of was) cta[k] = v; }
}

/** C28: the question added after the seller question where the seller is "a private individual / other". */
const NON_TAXPAYER_Q: EngineQuestion = Object.freeze({
  id: 'LC-seller-nontax', group: 'History of the premises', type: 'single',
  ask: 'Was that seller a charity, or another body that pays no UK tax?',
  help: 'A charity or another body that pays no tax could never claim allowances on the fixtures. Then we look further back, to an earlier owner who could.',
  opts: Object.freeze([['yes', 'Yes, a charity or another body that pays no tax'], ['no', 'No, a person or a business that pays tax'], ['unsure', 'Not sure']] as const) as unknown as readonly (readonly [string, string])[],
  showIf: (s: Record<string, unknown>) => s['__seller_answer'] === 'other' && LEGAL_READINGS.non_taxpayer_seller,
  onSet: (s: Record<string, unknown>, v: unknown) => { if (v === 'yes') { s['prior_owner_entitled'] = 'no'; s['__seller_non_taxpayer'] = true; } },
});

/** Does this engine question set who the seller was (prior_owner_entitled)? Found by its effect, as LEGAL_FACT is. */
const setsSeller = (q: EngineQuestion): boolean => factsSetBy(q).includes('prior_owner_entitled');
/** Does it set how the client took the property on (transaction_type)? */
const setsTransaction = (q: EngineQuestion): boolean => factsSetBy(q).includes('transaction_type');

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
  const engine = all.filter((q) => factsSetBy(q).some((k) => LEGAL_FACT.test(k)));
  const picked: EngineQuestion[] = [];
  for (const q of engine) {
    /* PHASE 159h (C8): HOW THE CLIENT TOOK THE PROPERTY ON is asked on every purchase of the property, not only where an
       election is held: a new lease for a premium, or a transfer below value, changes the route whether or not there
       is an election (no election is available at all on s.196 Table items 2 and 3). */
    if (setsTransaction(q)) {
      picked.push(Object.freeze({ ...q, showIf: (st: Record<string, unknown>) => Array.isArray(st['trigger']) && (st['trigger'] as string[]).includes('purchase') && (st['deal'] === 'property' || st['deal'] === 'buyin') }));
      continue;
    }
    picked.push(q);
    if (setsSeller(q)) picked.push(NON_TAXPAYER_Q);
  }
  const frozen = Object.freeze(picked);
  cache.set(sector, frozen);
  return frozen;
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
  /** PHASE 159h (C11): where an election over the fixtures generally gives separate figures, the integral features'
   *  figure caps the special rate pool and the rest caps the main pool. Null where there is no split. */
  readonly pool_caps?: { readonly special_pence: number; readonly main_pence: number } | null;
  /** PHASE 159h (item 7): the purchase is not the client's to claim on as a tenant (the route reads it as W3). */
  readonly tenant_purchase?: boolean;
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
export function assessLegal(sector: string, answers: ReadonlyMap<string, unknown>, nowIso: string, claimant: string,
  /** PHASE 159h (item 7): how the client holds the building, from the property (who-claims.ts propertyTenure). Absent:
   *  not read at all (a caller with no property). Present and null: not known — asked, never assumed (N4). */
  holding?: { readonly role: ClaimantRole | null },
): { asked: EngineQuestion[]; unanswered: EngineQuestion[]; verdict: LegalVerdict } {
  return assessLegalUnder(LEGAL_READINGS, sector, answers, nowIso, claimant, holding);
}

/** The same, under readings a caller names: the tests, to show what each reading moves. The pack uses `assessLegal`. */
export function assessLegalUnder(readings: LegalEngineReadings, sector: string, answers: ReadonlyMap<string, unknown>, nowIso: string, claimant: string,
  holding?: { readonly role: ClaimantRole | null },
): { asked: EngineQuestion[]; unanswered: EngineQuestion[]; verdict: LegalVerdict } {
  return withLegalEngineReadings(readings, () => assessLegalHeld(sector, answers, nowIso, claimant, holding));
}

function assessLegalHeld(sector: string, answers: ReadonlyMap<string, unknown>, nowIso: string, claimant: string,
  holding?: { readonly role: ClaimantRole | null },
): {
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
    if (setsSeller(q)) {
      s['__seller_answer'] = answers.get(q.id);
      // PHASE 159h (C26, OUR READING): a landlord barred by s.35 was never entitled to claim; look past them.
      if (LEGAL_READINGS.s35_seller_not_entitled && s['prior_owner_s35_barred'] === true) s['prior_owner_entitled'] = 'no';
    }
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

    /* PHASE 159h (C6): ANSWERS THAT CANNOT ALL BE TRUE ARE NEVER CLEAR. "A previous owner claimed", with a seller who
       could never claim and nobody earlier who could, contradicts itself; the engine read the last two and switched the
       rules off. Until a person settles which answer is wrong, the check is not known. */
    if (s['prior_owner_claimed'] === 'yes' && s['prior_owner_entitled'] === 'no' && s['earlier_entitled_owner'] === 'no') {
      return { level: 'AMBER', headline: 'The answers disagree. A previous owner claimed, but the seller could never claim and nobody earlier could. Check which answer is wrong.',
        why: ['You said a previous owner claimed. You also said the seller could never claim, and nor could anyone before. Both cannot be true.'], actions: ['Check the property enquiry replies and the title history. Then correct the wrong answer.'], ...none };
    }

    /* PHASE 159h (C8, OUR READING): THE LEASE ROUTE. A premium for a new lease: the fixtures pass to the tenant only on a
       joint s.183 election where the landlord could claim; where it could not (an NHS body, a developer, a charity),
       s.184 treats the tenant as owner. Whether an election was made, where it matters, must be known. */
    if (LEGAL_READINGS.lease_route && s['transaction_type'] === 'lease_premium') {
      const landlordCould = s['prior_owner_entitled'];
      const s183 = s['s183_election_made'];
      if (landlordCould === 'yes' && s183 === 'no') {
        return { level: 'RED', headline: 'On these answers, the fixtures stay the landlord’s. A new lease with no joint election does not pass them to the tenant.',
          why: ['A premium was paid for a new lease. The landlord could claim, and no joint election was made (s.183). So the landlord still owns the fixtures (s.176), and the premium buys the tenant no claim on them.'],
          actions: ['Claim only the fixtures the client paid for itself, as a tenant’s fit-out.'], ...none };
      }
      if (landlordCould === 'yes' && s183 !== 'yes') {
        return { level: 'AMBER', headline: 'Find out whether a joint election was made when the lease was granted. It decides whether the fixtures pass to the tenant.',
          why: ['a premium was paid for a new lease from a landlord who could claim; only a joint s.183 election passes the fixtures to the tenant'], actions: ['Ask for the lease and any s.183 election made with it.'], ...none };
      }
      if (landlordCould !== 'no' && landlordCould !== 'yes') {
        return { level: 'AMBER', headline: 'Find out whether the landlord who granted the lease could claim allowances. It decides whether the fixtures pass to the tenant.',
          why: ['on a new lease for a premium, s.183 (a landlord who could claim) and s.184 (one who could not) lead to different answers'], actions: ['Establish who the landlord was.'], ...none };
      }
    }

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
    /* PHASE 159h (C7, OUR READING): SECTION 185 LOOKS PAST A SELLER WHO COULD NEVER CLAIM to the earlier owner who
       could. The claim is capped at the value fixed when that owner sold on (G12bv), and is not settled while it is not
       known. */
    if (LEGAL_READINGS.s185_earlier_cap && s['prior_owner_entitled'] === 'no' && s['earlier_entitled_owner'] === 'yes') {
      const v = poundsToPence(s['earlier_disposal_value']);
      if (v === null || v === 0) {
        return { level: 'AMBER', headline: 'Find the value the fixtures were fixed at when the earlier owner sold on. Section 185 caps the claim at it.',
          why: [...why, 'The seller could never claim, but an earlier owner could. Section 185 caps the claim at the value fixed when that owner sold on. We do not know that value yet.'],
          actions: [...actions, 'Trace the earlier sale in the title history, and its election or the price put on the fixtures.'], ...none };
      }
      if (cap === null || v < cap) { cap = v; cap_words = 'the value fixed when the earlier owner sold on (section 185)'; }
    }
    /* PHASE 159h (C11): AN ELECTION IS CHECKED POOL BY POOL. Where it gives the integral features a figure of their own,
       that figure caps the special rate pool and the rest caps the main pool — not only the total. */
    let pool_caps: LegalVerdict['pool_caps'] = null;
    if (e.outcome === el.OUT['CAP_ELECT'] && e.scope?.mode === 'all_fixtures' && s['election_rate_split'] === 'split') {
      const total = poundsToPence(e.value), sr = poundsToPence(s['election_value_sr']);
      if (total !== null && sr !== null && sr <= total) pool_caps = { special_pence: sr, main_pence: total - sr };
    }
    if (e.outcome === el.OUT['LIVE'] || a.outcome === fx.OUT['LIVE']) {
      const deadline = iso(a.window?.deadline ?? null) ?? iso(el.electionDeadline(s));
      return { level: 'URGENT', headline: `There is still time to fix the value${deadline === null ? '' : ` — by ${deadline}`}. The claim can go ahead, and someone must act before then.`,
        why, actions, deadline, cap_pence: cap, cap_words, pool_caps };
    }
    return { level: 'GREEN', headline: cap === null ? 'The purchase rules are met, or do not reach this claim.' : 'The purchase rules are met. The claim on the fixtures is capped.',
      why, actions, deadline: null, cap_pence: cap, cap_words, pool_caps };
  })();
  return { asked, unanswered, verdict: holding === undefined ? verdict : withHolding(verdict, holding.role, s) };
}

/**
 * PHASE 159h (item 7, carried from 159g): WHO CLAIMS, READ BY THE LEGAL CHECK.
 *   TENANT    its claim is on the fixtures it paid for (its own fit-out), never a share of a purchase price — unless it
 *             paid a premium for a new lease, which takes the lease route above (s.183 / s.184). A tenant who bought
 *             an existing lease takes over only the outgoing tenant's fixtures, never the landlord's: a person must say
 *             which. Either way the purchase is not settled here.
 *   LANDLORD  its claim is on the fixtures it owns; a fixture the tenant put in is the tenant's (s.176).
 *   not known asked, never assumed (N4): the check says so and decides nothing on it.
 */
function withHolding(v: LegalVerdict, role: ClaimantRole | null, s: Record<string, unknown>): LegalVerdict {
  const trigger = Array.isArray(s['trigger']) ? s['trigger'] as string[] : [];
  const purchase = trigger.includes('purchase') && (s['deal'] === 'property' || s['deal'] === 'buyin');
  if (role === null) return { ...v, actions: [...v.actions, 'Ask who owns the building and who uses it: an owner, a landlord and a tenant claim different things.'] };
  if (role === 'LANDLORD') return { ...v, actions: [...v.actions, 'The client lets this building. Leave out any fixture the tenant put in: it is the tenant’s to claim (s.176).'] };
  if (role === 'TENANT' && purchase && s['transaction_type'] !== 'lease_premium' && (v.level === 'GREEN' || v.level === 'URGENT')) {
    return { ...v, level: 'AMBER', tenant_purchase: true,
      headline: 'The client rents this building. A tenant claims the fixtures it paid for itself, not a share of a purchase price.',
      why: [...v.why, 'The client is a tenant, so it claims the fixtures it paid for (s.176). A new lease bought for a premium can bring fixtures with it. So can a lease bought from the last tenant, but only that tenant’s, never the landlord’s.'],
      actions: [...v.actions, 'Price the tenant’s own fit-out as work done. If it bought an existing lease, list the fixtures the outgoing tenant owned.'], cap_pence: null, cap_words: null };
  }
  return v;
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
  return withPastOwnerGrants(assessLegal(sector, values, nowIso, claimantFor(db, job.business_id), holdingFor(db, job.id)).verdict, pastOwnerGrants(db, job.id));
}

/** PHASE 159i (item 1): the grants an EARLIER owner received, on the job's claim — their amounts, in pence (null: not known). */
function pastOwnerGrants(db: Db, job_id: string): (number | null)[] {
  return db.all<{ amount_pence: number | null }>(
    "SELECT g.amount_pence FROM claim_grants g JOIN surveyor_jobs j ON j.claim_id = g.claim_id WHERE j.id = ? AND g.paid_to = 'PAST_OWNER' AND g.withdrawn_at IS NULL",
    [job_id]).map((r) => r.amount_pence);
}

/**
 * PHASE 159i (item 1, Rulebook F; s.185 with s.62): AN EARLIER OWNER'S GRANT LOWERS THE CAP FROM THE EARLIER SALE, never
 * the buyer's price. That owner could claim only what it paid less the grant, so what passes on is lower by it. Where
 * a cap stands it comes down by the grant; an amount not known leaves the check not settled (N4); with no cap, the
 * surveyor is told to size one.
 */
export function withPastOwnerGrants(v: LegalVerdict, grants: readonly (number | null)[]): LegalVerdict {
  if (grants.length === 0 || (v.level !== 'GREEN' && v.level !== 'URGENT')) return v;
  if (grants.some((g) => g === null)) {
    return { ...v, level: 'AMBER', headline: 'An earlier owner received a grant, and its amount is not known. It lowers what could pass to the client.', actions: [...v.actions, 'Find how much the earlier owner’s grant paid.'] };
  }
  const total = grants.reduce<number>((t, g) => t + (g as number), 0);
  if (v.cap_pence === null) return { ...v, actions: [...v.actions, `An earlier owner received grants of ${poundsWords(total)}. They lower what could pass to the client (s.185 and s.62): size the cap from the earlier sale.`] };
  const cap = Math.max(0, v.cap_pence - total);
  return { ...v, cap_pence: cap, cap_words: `${v.cap_words ?? 'the cap'}, less the earlier owner’s grant of ${poundsWords(total)}` };
}

/** PHASE 159h (item 7): how the client holds the pack's building — the pack's chosen property, else its claim's. */
function holdingFor(db: Db, job_id: string): { role: ClaimantRole | null } | undefined {
  const p = db.get<{ p: string | null }>(
    'SELECT COALESCE(sp.property_id, c.property_id) AS p FROM surveyor_jobs j LEFT JOIN survey_packs sp ON sp.job_id = j.id LEFT JOIN claims c ON c.id = j.claim_id WHERE j.id = ?', [job_id])?.p ?? null;
  return p === null ? undefined : { role: claimantRole(db, p).role };
}

/** PHASE 159i (item 3): what the cap is checked against — the pack's figure and pools, less the buyer's own alterations
 *  (s.25), which are claimed on top of the cap. */
export function capped(v: { readonly sums: { readonly qualifying_pence: number | null; readonly main_pool_pence: number | null; readonly special_pool_pence: number | null }; readonly money?: { readonly alterations_pence: number } }):
  [number | null, { main_pence: number | null; special_pence: number | null }] {
  const a = v.money?.alterations_pence ?? 0;
  const less = (x: number | null) => (x === null ? null : Math.max(0, x - a));
  return [less(v.sums.qualifying_pence), { main_pence: less(v.sums.main_pool_pence), special_pence: v.sums.special_pool_pence }];
}

/** May this pack be approved, as far as the legal check goes? (Stage 3 asks this.) */
export function legalAllows(v: LegalVerdict, qualifying_pence: number | null, pools?: { main_pence: number | null; special_pence: number | null }): { ok: boolean; why: string } {
  if (v.level === 'RED' || v.level === 'AMBER') return { ok: false, why: v.headline };
  if (v.cap_pence !== null && qualifying_pence !== null && qualifying_pence > v.cap_pence) {
    return { ok: false, why: `The pack’s figure is above ${v.cap_words ?? 'the cap'}. The claim on the fixtures cannot be more than that.` };
  }
  // PHASE 159h (C11): each pool against its own part of the election.
  if (v.pool_caps !== null && v.pool_caps !== undefined && pools !== undefined) {
    if (pools.special_pence !== null && pools.special_pence > v.pool_caps.special_pence) {
      return { ok: false, why: `The pack’s special rate pool is above the election’s figure for the integral features, ${poundsWords(v.pool_caps.special_pence)}. Move the excess or lower it.` };
    }
    if (pools.main_pence !== null && pools.main_pence > v.pool_caps.main_pence) {
      return { ok: false, why: `The pack’s main pool is above the election’s figure for the other fixtures, ${poundsWords(v.pool_caps.main_pence)}.` };
    }
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
  const r0 = assessLegal(job.sector, values, d.now(), claimantFor(d.db, job.business_id), holdingFor(d.db, job.id));
  const r = { ...r0, verdict: withPastOwnerGrants(r0.verdict, pastOwnerGrants(d.db, job.id)) };
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

