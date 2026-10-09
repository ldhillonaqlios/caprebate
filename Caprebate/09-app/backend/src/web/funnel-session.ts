/**
 * THE FUNNEL STATE, MAPPED ONTO AN ENGINE SESSION.        Phase 113b, 9 Sep 2026
 *
 * The six screens write a CB_FUNNEL state; the engine takes a Session, which is
 * a different shape with about 190 named facts. This file is the mapping, and
 * it is the only one — `unestablishedGates` in engaged.ts used to carry three
 * `if` statements inline and said in its own header that the rest was missing.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE RULE THIS FILE IS WRITTEN UNDER
 *
 * A QUESTION MAPPED ONTO THE WRONG SESSION FACT IS WORSE THAN ONE NOT MAPPED
 * AT ALL. An unmapped fact stays ABSENT, and absent is the state the engine is
 * written to expect — every relieving gate in CB_CASH treats absent exactly as
 * it treats "unsure". A fact mapped wrongly is a tax answer changed by a
 * screen, and nothing downstream can tell it apart from one the client gave.
 *
 * So every mapping below is justified from THE ENGINE'S OWN CODE — the key it
 * reads, or the question whose `onSet` sets it — and never from two field
 * names looking alike. Where the evidence did not reach that bar the fact is
 * LEFT UNMAPPED and the reason is written down, under NOT MAPPED at the foot
 * of this file. That list is the more useful half of this module.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * N4 IS THE ACCEPTANCE TEST, AND IT IS ENFORCED IN ONE PLACE
 *
 * A DONT_KNOW or a SKIPPED answer sets NOTHING. Every value that reaches a
 * `set` call below has been through `known()`, which returns null for null,
 * undefined, the empty string and each of the funnel's three "I don't know"
 * spellings — "not sure" (Q1, Q1b), "dont_know" (Q1a) and "unsure" (the profit
 * follow-up). Three spellings for one state is not tidy, but they are the
 * strings the site's own OPTIONS lists use and this file transcribes rather
 * than renames them.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHY THE DRAFT AND NOT THE ANSWER ROWS
 *
 * `assessment_answers` looks like the obvious source and it is the wrong one:
 * ITS `question_id` IS NOT A SINGLE VOCABULARY. The funnel writes Q1 for
 * "have you already claimed on the fixtures"; `src/seed.ts` writes Q1 for "how
 * is the business set up" with the value "company". The three-question mapping
 * this file replaces read the first and got the second, so every seeded
 * business carried `own_prior_claim: "company"` — a fact nobody stated, on a
 * key the front door reads. It was inert only because no branch matches that
 * string.
 *
 * `assessment_drafts.state_json` has one writer, `applyScreen` in router.ts,
 * and one vocabulary, CB_FUNNEL's. Where there is no draft row — a seeded or
 * imported assessment — NOTHING IS MAPPED, deliberately: an absent fact is the
 * state the engine expects, and guessing a second undeclared vocabulary is the
 * error this file exists to avoid.
 */

import type { Db } from '../db.ts';
import { newSession, type SectorId, type Session } from './engine.ts';

/* ------------------------------------------------------------------ *
 * READING THE STATE
 * ------------------------------------------------------------------ */

/** The funnel state as it survives on disk. Everything is optional and unknown. */
export type FunnelStateRow = Record<string, unknown>;

/**
 * The state the six screens wrote for this assessment, or undefined.
 *
 * The draft is keyed by its own token; `submitted_assessment_id` is what ties
 * it to the assessment `submit()` created from it. One row per assessment.
 */
export function funnelStateFor(db: Db, assessment_id: string): FunnelStateRow | undefined {
  const row = db.get<{ state_json: string }>(
    'SELECT state_json FROM assessment_drafts WHERE submitted_assessment_id = ?', [assessment_id],
  );
  if (row === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(row.state_json);
    return typeof parsed === 'object' && parsed !== null ? (parsed as FunnelStateRow) : undefined;
  } catch {
    // A draft we cannot parse is not a draft we may guess at.
    return undefined;
  }
}

/* ------------------------------------------------------------------ *
 * N4 — THE ONE PLACE AN UNKNOWN IS TURNED AWAY
 * ------------------------------------------------------------------ */

/**
 * The three spellings of "I don't know" the six screens actually use.
 *
 * Transcribed from `OPTIONS` in assessment.ts, which is itself transcribed from
 * the site renderer. `answerRows()` in that file turns each of them into a
 * DONT_KNOW row with a null value, which is the same decision as this one.
 */
const DONT_KNOW = new Set(['not sure', 'dont_know', 'unsure']);

/**
 * A value if the client gave one, null otherwise.
 *
 * NULL, UNDEFINED, "" AND EVERY "I DON'T KNOW" ALL RETURN NULL, and a caller
 * that gets null sets nothing at all. That is the whole of N4 at this boundary
 * and it is why nothing below repeats the check.
 */
function known(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (t === '' || DONT_KNOW.has(t)) return null;
  return t;
}

/** A positive, finite number the client actually typed. Never 0, never NaN. */
function knownAmount(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

/* ------------------------------------------------------------------ *
 * THE VALUE TABLES — funnel vocabulary on the left, engine's on the right
 * ------------------------------------------------------------------ */

/**
 * CB_FUNNEL.ENTITY_LABEL keys onto the engine's claimant facts.
 *
 * THE RIGHT-HAND SIDE IS READ OFF THE SECTOR FLOWS' OWN QUESTION. G1 in
 * sector-gp.js (and its four twins) offers partnership / llp / company /
 * federation / sole_trader and sets, in one line:
 *     s.claimant_raw  = v
 *     s.claimant_type = (company|federation) -> "company", sole_trader -> itself, else v
 * So "ltd" — the funnel's own key, labelled "Limited company" — is the engine's
 * "company", labelled "Limited company". Same option, two spellings.
 *
 * "unsure" IS ABSENT FROM THIS TABLE ON PURPOSE. `known()` turns it away before
 * the lookup; it is listed here only so a reader does not go looking for it.
 */
const CLAIMANT: Readonly<Record<string, { raw: string; type: string }>> = Object.freeze({
  ltd: { raw: 'company', type: 'company' },
  llp: { raw: 'llp', type: 'llp' },
  partnership: { raw: 'partnership', type: 'partnership' },
  sole_trader: { raw: 'sole_trader', type: 'sole_trader' },
});

/**
 * CB_FUNNEL.TRIGGER_LABEL keys onto the engine's TriggerKind.
 *
 * THREE OF THE FOUR ARE THE SAME WORD. The fourth differs by an underscore:
 * the funnel's "fit_out" is labelled "We fitted out a property we lease" and
 * the sector question's "fitout" is labelled "Fitted out leased premises" —
 * the same event, and the engine reads `s.trigger.includes("fitout")` in every
 * flow, so the underscore has to go or the fact does not arrive.
 *
 * "refurb" MAPS TO "refurb" ALONE AND NOT ALSO TO "extension", even though the
 * funnel labels it "We refurbished OR EXTENDED a property we already owned".
 * The engine has both as separate ticks on a multi-select and the client
 * answered a single control; adding "extension" would put a second event on
 * the session that nobody selected. Every branch that reads "extension" also
 * reads "refurb", so nothing is lost by the narrower reading.
 */
const TRIGGER: Readonly<Record<string, string>> = Object.freeze({
  purchase: 'purchase',
  new_build: 'new_build',
  refurb: 'refurb',
  fit_out: 'fitout',
  // PHASE 159b (E11): an extension is new space; the engine sizes it as a new build.
  extension: 'new_build',
});

/**
 * The profit follow-up onto CB_CASH gate 1.
 *
 * "profitable" AND "loss" ARE UNAMBIGUOUS. The engine's own profit question in
 * CB_TAXPOS offers "Yes — comfortably profitable that year" and "No — around
 * break-even, or loss-making", and sets `s.sufficient_profit` to yes / no.
 *
 * "breakeven" IS DELIBERATELY NOT IN THIS TABLE, AND IT IS THE ONE JUDGEMENT
 * CALL IN THIS FILE. CB_TAXPOS's own wording bundles "around break-even" with
 * loss-making under the answer that sets "no" — but the funnel offers
 * break-even as a THIRD option beside loss-making, so a client who picked it
 * was distinguishing itself from a loss, and reading it as "no" would print
 * "insufficient taxable profit CONFIRMED" about a business that confirmed no
 * such thing. Leaving it unmapped behaves exactly as the old code's "unsure"
 * did — gate 1 treats absent and "unsure" identically — so nothing moves, and
 * the panel goes on asking. Open as a question for the chartered tax adviser:
 * "Is 'roughly break-even' enough profit for the relief to bite on?"
 *
 * It reaches the session ONLY through `FUNNEL_SWITCHES` below, which ships off.
 */
const PROFIT: Readonly<Record<string, string>> = Object.freeze({
  profitable: 'yes',
  loss: 'no',
});

/**
 * THE BREAK-EVEN SWITCH — SHIPPED OFF.                     Phase 115, 10 Sep 2026
 *
 * The reading the engine's own profit question points at, built and left inert
 * so that the tax adviser's answer to the question above is a one-line change
 * rather than a build — the standing rule that a thing which can be built
 * before the person it waits on has answered is built and switched off.
 *
 * OFF, as shipped: "breakeven" is not in PROFIT and sets nothing, so a
 * break-even client, a "not sure" client and a client who was never asked
 * produce THE SAME SESSION. That is N4, and engaged.test.ts asserts it three
 * ways across all five sectors.
 *
 * ON: "breakeven" sets `sufficient_profit` to "no" and NOTHING ELSE MOVES. "no"
 * is the cautious branch — CB_CASH gate 1 shuts, no near-term cash figure is
 * shown, and the loss carry-back route is pointed at; it relieves nobody. The
 * session is then identical to a loss-making client's. "not sure" and absent
 * still set nothing with the switch on. What turning it on costs is the thing
 * the question records: "insufficient taxable profit confirmed" printed about a
 * business that told us only that it was roughly break-even.
 *
 * NOT AN ENGINE SWITCH. It lives at the funnel-to-session boundary in the back
 * end, not in `Caprebate site.html`, so the extraction verifier's count of the
 * tax adviser's engine switches does not include it, and must not be edited to.
 */
export type FunnelSwitches = { readonly breakeven_is_insufficient_profit: boolean };

export const FUNNEL_SWITCHES: FunnelSwitches = Object.freeze({
  breakeven_is_insufficient_profit: false,
});

/** The funnel's own spelling, from `OPTIONS.current_year_position` in assessment.ts. */
const BREAKEVEN = 'breakeven';

/* ------------------------------------------------------------------ *
 * THE MAPPING
 * ------------------------------------------------------------------ */

/** What was mapped, for a caller that wants to say so on a screen or in a test. */
export type MappedSession = {
  readonly session: Session;
  /** The session keys this mapping set, in the order it set them. */
  readonly set: readonly string[];
  /** True where a funnel state was found and read; false where none survives. */
  readonly from_funnel: boolean;
};

/**
 * A Session carrying every funnel answer this file can defend, and nothing else.
 *
 * `state` is the CB_FUNNEL state; pass undefined where none survives and you
 * get the bare session `newSession` returns, which sets no facts at all.
 *
 * `switches` defaults to the shipped `FUNNEL_SWITCHES`. Every production caller
 * passes nothing; the parameter exists so both positions can be asserted.
 */
export function sessionFromFunnel(
  sector: SectorId, state: FunnelStateRow | undefined, switches: FunnelSwitches = FUNNEL_SWITCHES,
): MappedSession {
  const session = newSession(sector);
  const set: string[] = [];
  const put = (key: string, value: string | number | boolean): void => {
    (session as Record<string, unknown>)[key] = value;
    set.push(key);
  };

  if (state === undefined) return { session, set, from_funnel: false };

  /* ---- Q1 · the client's own earlier claim ---------------------------- *
   * SAME KEY, SAME VOCABULARY. CB_FRONTDOOR.gateQ1 reads `s.own_prior_claim`
   * and understands "yes" and "not sure"; the funnel stores exactly that field
   * under exactly that name. This is a carry-across, not a translation.
   * It does NOT set `prior_claim_self` — see NOT MAPPED below. */
  const prior = known(state.own_prior_claim);
  if (prior !== null) put('own_prior_claim', prior);
  /* PHASE 159b (E5): THE FOUR-STAGE FUNNEL ASKS THE NARROW QUESTION. Its claims screen asks "Have you, or your business,
   * already claimed on the fixtures in this building, such as the wiring and heating?" — a fixtures claim of the
   * client's own, not a van or a repair, which is the objection under NOT MAPPED below. So for a funnel-4 assessment a
   * "yes" sets `prior_claim_self`, and the engine leaves nothing to claim on that spend (CB_INPUTS.run). "Not sure"
   * sets nothing. The older six-screen funnel keeps its broader question and is not mapped. */
  if (state['funnel'] === 4 && prior === 'yes') put('prior_claim_self', true);

  /* ---- Q1b · the tax position ----------------------------------------- *
   * TWO KEYS, BOTH READ FROM THE CODE. CB_FRONTDOOR.gateQ1b reads
   * `s.is_uk_taxpayer`, and the sector flows' own G2 — "Does the practice pay
   * UK income tax or corporation tax on its profits?", the same question in
   * the same words — sets `s.is_taxpayer` from yes / no / unsure. The funnel
   * cannot deliver "no" here: gateQ1b stops that client at a reasoned negative
   * and the funnel is never submitted, so in practice this is "yes" or absent. */
  const taxpayer = known(state.is_uk_taxpayer);
  if (taxpayer !== null) {
    put('is_uk_taxpayer', taxpayer);
    if (taxpayer === 'yes' || taxpayer === 'no') put('is_taxpayer', taxpayer);
  }

  /* ---- Q1b follow-up · CB_CASH gate 1 --------------------------------- *
   * "breakeven" reaches the session only with the switch on, and only as "no".
   * Off, as shipped, it falls through exactly as "unsure" does. */
  const position = known(state.current_year_position);
  const profit = PROFIT[position ?? '']
    ?? (switches.breakeven_is_insufficient_profit && position === BREAKEVEN ? 'no' : undefined);
  if (profit !== undefined) put('sufficient_profit', profit);

  /* ---- Q2 · the property ---------------------------------------------- *
   * ONE PROPERTY ONLY, AND THAT IS A DECISION RATHER THAN A LIMITATION.
   *
   * A Session describes ONE claim. The funnel takes as many properties as the
   * client wants to type and CB_FUNNEL's own comment on `combineCeilings` says
   * what happens when they are added together: "a total that gets LESS
   * achievable with every property added". Picking the first of several would
   * put one building's entity, trigger and spend onto a session the panel then
   * reports about all of them.
   *
   * So where there is more than one property, none of these three facts is
   * mapped and they stay absent. The sector is exempt from that rule because
   * `assessments.sector` already takes the first property's — `submit()` does
   * it, the engine cannot run without one, and this file may not disagree with
   * the row it was handed. */
  const properties = Array.isArray(state.properties) ? (state.properties as FunnelStateRow[]) : [];
  const only = properties.length === 1 ? properties[0] : undefined;
  if (only !== undefined) {
    const claimant = CLAIMANT[known(only.entity_type) ?? ''];
    if (claimant !== undefined) {
      put('claimant_raw', claimant.raw);
      put('claimant_type', claimant.type);
    }

    const trigger = TRIGGER[known(only.trigger) ?? ''];
    if (trigger !== undefined) {
      (session as Record<string, unknown>).trigger = [trigger];
      set.push('trigger');
    }

    /* THE SPEND, AND THE CHECKBOX BESIDE IT. `spend_unknown` is the funnel's
     * own "I don't know" for a currency field and router.ts already nulls the
     * amount when it is ticked — this reads both rather than trusting one.
     * The engine's own money question, G9 "Roughly how much was the purchase
     * price or spend?", sets `s.base_amount`, and the funnel's field is the
     * same money under whichever of the four labels
     * CB_FRONTDOOR.spendFieldsFor gives it. */
    const spend = only.spend_unknown === true ? null : knownAmount(only.spend);
    if (spend !== null) put('base_amount', spend);

    /* PHASE 159b (E6): THE SELLER'S CLAIM, ON A PURCHASE OF THE BUILDING. The funnel-4 claims screen asks it only of a
     * building the client says "We bought it" of — buying the building, which is the engine's own "deal: property".
     * "yes" and "no" reach `prior_owner_claimed`, so the s.187A reading runs; "don't know" sets nothing (N4). The
     * older funnel asks it of every client on every trigger, and is still not mapped (NOT MAPPED, Q1a). */
    if (state['funnel'] === 4 && known(only.trigger) === 'purchase') {
      const seller = known(only.previous_owner_claimed);
      if (seller === 'yes' || seller === 'no') put('prior_owner_claimed', seller);
    }
  }

  return { session, set, from_funnel: true };
}

/* ===================================================================== *
 * NOT MAPPED — every funnel field this file deliberately leaves absent,
 * and why. This list is part of the mapping.
 *
 * Q1 -> `prior_claim_self`   THE ENGINE ITSELF SAYS NOT TO, AND SAYS WHY.
 *   CB_FRONTDOOR's note above gateQ1: "'A claim' in a client's mouth covers a
 *   repairs deduction, annual investment allowance on loose equipment,
 *   allowances on a van, and a genuine fixtures claim. Four different facts,
 *   one word, and only the fourth would matter." The sector flows ask the
 *   narrow question separately and set `prior_claim_self = (v === "fixtures")`.
 *   Reading the funnel's broad answer onto that key would shut CB_CASH gate 4
 *   — "fixtures already claimed — no further allowance to convert to cash" —
 *   on a client who once claimed for a van. The funnel already routes this
 *   answer where it belongs: gateQ1 raises CTA_REVIEW_PRIOR_CLAIM.
 *
 * Q1a -> `prior_owner_claimed`   THE ENGINE ASKS IT ON FACTS THE FUNNEL HAS
 *   NOT ESTABLISHED. The sector question (Q11 in sector-care_homes.js and its
 *   twins) carries `showIf: s.trigger.includes("purchase") && s.deal ===
 *   "property"` — it is asked only of someone who bought the PROPERTY, as
 *   against shares or a partner buy-in. The funnel asks its version of every
 *   client on every trigger and never asks about the deal at all. The fact
 *   moves real money: it narrows the qualifying range and it decides whether
 *   the s.187A machinery runs. Supplying it on facts the engine's own flow
 *   would not have asked it on is the mapping error this file is written to
 *   avoid, so it waits for the deep flow that asks it properly.
 *
 * Q2 date -> `event_date` / `acquisition_date`   THE FUNNEL CAPTURES A MONTH
 *   OR A YEAR AND THE ENGINE WANTS A DATE. The renderer's placeholder is
 *   "MM/YYYY" for a purchase or a build and "YYYY" for works, and nothing
 *   validates either. `event_date` feeds the acquisition date and sits beside
 *   the accounting period end that CB_CASH turns into a statutory amendment
 *   window. A partial date silently parsed is a wrong window in front of a
 *   client, and the funnel never asks for the accounting period end anyway, so
 *   the window cannot be derived from what the six screens hold.
 *
 * Q3 works -> any spend fact   IT WOULD DOUBLE-COUNT, AND CB_FRONTDOOR HAS A
 *   FUNCTION WHOSE ONLY JOB IS TO PREVENT THAT. `worksHeadingFor` re-words the
 *   works question for a refurbishment or a fit-out because "asking 'any work
 *   done?' against that property invites the client to enter the same money a
 *   second time, and the figure inflates by exactly the amount they were most
 *   sure about". The engine has one `base_amount`; adding the works spend to
 *   it would be that inflation, and putting it anywhere else would be
 *   inventing a fact.
 *
 * `previous_owner_claimed` "no", `works_type`, `works_year`,
 * `lease_start_year`, `address`, `contact`, `account`   NO ENGINE FACT READS
 *   THEM, or the one that might is covered above. An address is not a session
 *   fact; the contact block and the account block are CB_BOOKING's and are
 *   personal data that has no business on a tax session at all.
 *
 * THE AIA HEADROOM AND THE POOL SPLIT ARE NOT ON THIS LIST because there is
 *   nothing to leave out: THE SIX SCREENS DO NOT ASK ABOUT EITHER, on any
 *   path. CB_TAXPOS's headroom question and CB_POOL's measured split belong to
 *   the deep sector flow and to the survey. That is why cash gates 2 and 3
 *   come back null from every funnel-derived session, and it is a true report
 *   rather than a gap in this mapping.
 * ===================================================================== */
