/**
 * A PERSON'S PICK FOR A CLOSE MATCH — the back office resolving a REVIEW-band lookup. Phase 146h, 23 September 2026.
 * Switched off: PICK_SWITCHES.MATCH_REVIEW_PICK is false.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT IT IS FOR
 *
 * The S10 Address Matching Spec scores every candidate a register returns and puts the result in one of three bands.
 * ACCEPT pre-fills. REJECT keeps nothing. In between sits REVIEW, and A.2 step 4 says exactly what should happen
 * there: "never auto-selected. Full candidate list (all postcode-blocked candidates, ranked) is surfaced to
 * ops/surveyor for manual pick. Nothing is written until a human resolves it."
 *
 * Until this phase there was nowhere to surface it to. A REVIEW was FAILED, code MATCH_REVIEW, and it kept nothing —
 * which is safe and is a dead end: the lookup had found the building and could not say so.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * AFTER A SIGNED ENGAGEMENT ONLY, AND THAT IS NOT A TIER RULE
 *
 * A.8 point 7 rules out showing a PROSPECT the list: "Before an engagement there is no one to hand a candidate list
 * to. Showing it to the prospect would show them records about other buildings, which safeguard S15 of the
 * assessment rules out." So the pick waits for a signed engagement — and it waits for one WHATEVER THE SOURCE'S
 * TIER. The energy certificates are free and gated on a published privacy notice; the pick on them still waits for
 * the signature, because what the signature buys here is not permission to consult the register (the free gate did
 * that) but a back office with a client to work on and somebody entitled to look at the list.
 *
 * THE GATE IS ASSERTED SERVER-SIDE, AGAINST THE RECORD, ON THIS REQUEST — `assertSignedEngagement` in
 * src/web/research.ts, the same function and the same record as the paid tier's, which since Phase 146f reads the
 * signature record rather than a letter merely marked SIGNED. NOTHING HERE OPENS A GATE and nothing here is a second
 * one: a source still goes through `stateUnderGates` and its own switch before a connector is handed anything, and
 * this adds one condition on top of those rather than replacing any of them.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE LIST IS FETCHED AGAIN AND IS NEVER STORED
 *
 * A.8 point 8: the candidate list, the register's address lines and the raw responses are not stored or logged. So
 * there is no table of candidates and no cache of them. Showing the list is a fresh lookup — the same connector, the
 * same audit row per call, the same cost — whose answer is turned into an offer and then dropped. Choosing is a
 * second fresh lookup, and the choice names a RECORD (a certificate number, a location id, a transaction id, a
 * company number, a UPRN) rather than a position in a list, so a list that came back in a different order cannot
 * move a choice onto another building. Where the register no longer offers the chosen one, NOTHING is kept and the
 * screen says to look again — taking the nearest instead would be the auto-selection A.2 step 4 forbids.
 *
 * That costs two lookups where one would do. It is the right trade: the alternative is a stored list of other
 * people's addresses, which is the thing the assessment's condition CA5 exists to prevent.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT A PICK WRITES
 *
 *   · the chosen record, and only it, through `ingestRegisterRecord` — THE ONE DOOR, where the name exclusion
 *     register is checked (N2). `storeResearchOutcomes` is what calls it, exactly as an ordinary click does, so
 *     there is no second way into `register_records` and this file writes none of them itself;
 *   · AT GRADE B AT MOST. A.6: until the 200-property test has calibrated a real threshold, an address-matched value
 *     is written at grade B and never A. A person choosing from a list that did NOT reach the threshold is that case
 *     at its weakest, so the cap binds here if it binds anywhere. It is DERIVED rather than typed —
 *     `worstGrade([the source's own max_grade, UNMEASURED_MATCH_GRADE_CAP])` — so a source that could only ever mint
 *     a C still mints a C, and the day the measurement lands and the cap moves, this moves with it;
 *   · the decision itself, on `register_match_picks`: the key, the score, the grade, who and when;
 *   · and the decision on THE AUDIT CHAIN, REGISTER_MATCH_PICKED, carrying the score, the grade, whether anything
 *     was chosen and the actor — never the label a person read, because that is the register's address line.
 *
 * CHOOSING NONE IS AN ANSWER AND IS KEPT. A person who looks at four candidates and says none of them is this
 * building has done real work, and the next person should not have to do it again. It writes a pick row with no key,
 * an audit row, and a source row that says a person looked. It keeps no fact: every question stays asked (N4).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT THIS DOES NOT DO, AND IT IS A REAL LIMIT RATHER THAN AN OVERSIGHT
 *
 * A PICK THAT STORED A RECORD CANNOT BE TAKEN BACK HERE. Once a choice lands, the lookup is FIRED and leaves the
 * REVIEW band, so `pickState` refuses to offer the list again — and it should, because at that point there is
 * nothing to choose between: the register was asked and answered. A person who chose the wrong building has to have
 * that record removed, which is a different act with a different shape (Phase 139's "take the tick off" is the
 * pattern), and it is NOT something to bolt onto a screen whose whole job is choosing. Someone may change their
 * mind freely up to the moment a record is stored: saying "none of them" leaves the band open and can be replaced.
 * Undoing a stored pick is written up as its own piece of work rather than half-built here.
 */

import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { authorise, type Actor } from '../authz.ts';
import {
  assertResearchSection, assertSignedEngagement, catalogue, consultAllowed, freeGate, stateUnderGates,
  storeResearchOutcomes, type CatalogueEntry, type RunDeps, type SourceOutcome,
} from './research.ts';
import { FREE_CONNECTORS } from '../connectors/free-registers.ts';
import { PAID_CONNECTORS } from '../connectors/paid-registers.ts';
import { switchedOn, REGISTER_SWITCHES } from '../connectors/registers.ts';
import { UNMEASURED_MATCH_GRADE_CAP, type ReviewCandidate } from '../connectors/matching.ts';
import { SOURCES as REGISTER_SOURCES, worstGrade, type Grade } from '../../../../04-phase-work/phase3/caprebate-source-register.ts';

/* ================================================================== *
 * 1 · THE SWITCH
 * ================================================================== */

/**
 * ITS OWN SWITCH, OFF, AND IT IS NOT ONE OF THE REGISTER SWITCHES.
 *
 * `REGISTER_SWITCHES` says whether a SOURCE's connector is turned on. This says whether a person may be offered a
 * list at all, which is a different decision with a different owner: the connectors are the developer's to turn on
 * once the keys are in and the supplier is happy, and this one is the data protection officer's, because what it
 * turns on is a screen that shows one client's staff a handful of other buildings' register entries. Putting it in
 * the same map would make the two look like one kind of thing with a flag on it.
 *
 * It is read by `connectorSwitchReadings` (src/web/case-stamp.ts) beside the others, so a claim's stamp says whether
 * a figure on it could have been a person's pick.
 */
export const PICK_SWITCHES: Readonly<Record<string, boolean>> = Object.freeze({
  MATCH_REVIEW_PICK: false,
});

/** Only `true` is on. Anything else, and anything absent, is off. */
export function pickSwitchedOn(switches: Readonly<Record<string, boolean>> = PICK_SWITCHES): boolean {
  return switches['MATCH_REVIEW_PICK'] === true;
}

/** The failure code a lookup carries when its best candidate was close and not close enough. Only this one is pickable. */
export const PICKABLE_FAILURE_CODE = 'MATCH_REVIEW';

/* ================================================================== *
 * 2 · MAY THIS ONE BE PICKED FROM, AND IS IT SWITCHED ON
 * ================================================================== */

export type PickDeps = RunDeps & { readonly pick_switches?: Readonly<Record<string, boolean>> };

export type PickState =
  | { readonly ok: true; readonly entry: CatalogueEntry }
  | { readonly ok: false; readonly why: string };

/**
 * EVERY CONDITION, IN THE ORDER THAT MAKES THE HONEST SENTENCE FIRST — the hardest blocker before the softest, as
 * `stateUnderGates` does, so that a person is never sent to wait for the wrong thing.
 *
 * THE STATE IS READ FROM THE RECORD, NEVER FROM THE REQUEST. Which source is pickable is decided by what
 * `research_sources` says happened last time, exactly as `retryFailedSource` decides what may be retried. A request
 * naming a source that did not land in the REVIEW band is refused, and it is refused with the same words whatever it
 * names — so the refusal cannot be used to find out what a lookup found.
 */
export function pickState(
  d: PickDeps, business_id: string, source_id: string,
): PickState {
  const entry = catalogue().find((e) => e.source_id === source_id);
  if (entry === undefined) return { ok: false, why: 'we do not use that lookup' };

  const engagement = assertSignedEngagement(d.db, business_id);
  if (!engagement.signed) {
    return {
      ok: false,
      why: 'Choosing between close matches is something we do once the engagement letter is signed — ' +
        engagement.why + '. Before that we would be showing other buildings’ records to somebody who is not yet a client.',
    };
  }
  if (!pickSwitchedOn(d.pick_switches ?? PICK_SWITCHES)) {
    return { ok: false, why: 'Choosing between close matches is built and is not switched on yet, so no list was fetched.' };
  }
  if (!switchedOn(source_id, d.outside?.switches ?? REGISTER_SWITCHES)) {
    return { ok: false, why: 'That lookup is not switched on yet, so there is no list to show.' };
  }
  if (FREE_CONNECTORS[source_id] === undefined && PAID_CONNECTORS[source_id] === undefined) {
    return { ok: false, why: 'There is no connector for that lookup in this build, so there is no list to show.' };
  }
  const row = d.db.get<{ state: string; failure_code: string | null }>(
    'SELECT state, failure_code FROM research_sources WHERE business_id = ? AND source_id = ?',
    [business_id, source_id],
  );
  if (row?.state !== 'FAILED' || row.failure_code !== PICKABLE_FAILURE_CODE) {
    return {
      ok: false,
      why: 'There is nothing to choose between on that lookup. A list is offered only where it found entries that ' +
        'were close to this address and not close enough for us to pick one.',
    };
  }
  return { ok: true, entry };
}

/* ================================================================== *
 * 3 · SHOW THE LIST
 * ================================================================== */

export type PickOffer = {
  readonly ok: boolean;
  readonly why: string;
  readonly source_id: string;
  /** The publisher's name, for the screen. Empty where the source is not one we use. */
  readonly publisher: string;
  /** Ranked, best first. Held for this request only — nothing stores it and no audit row carries it. */
  readonly candidates: readonly ReviewCandidate[];
  /** What was chosen last time, where somebody has already looked. Null where nobody has. */
  readonly already: PickRecord | null;
};

export type PickRecord = {
  readonly chosen_key: string | null;
  readonly score: number | null;
  readonly grade: string | null;
  readonly picked_at: string;
  readonly picked_by: string;
};

export function lastPick(db: Db, business_id: string, source_id: string): PickRecord | null {
  return db.get<PickRecord>(
    'SELECT chosen_key, score, grade, picked_at, picked_by FROM register_match_picks ' +
      'WHERE business_id = ? AND source_id = ?',
    [business_id, source_id],
  ) ?? null;
}

/**
 * THE RANKED CANDIDATES FOR ONE LOOKUP, FETCHED AGAIN FOR THIS REQUEST.
 *
 * It runs the connector through `consultAllowed`, which is the only path a connector is ever reached by: the gate
 * decision first, then the switch, then the key, then the calls — each one audited and each one costed. What comes
 * back is a NOT_MATCHED, exactly as it did before, and the ranked list arrives separately through the `review` hook.
 *
 * NOTHING IS STORED BY THIS CALL. `storeResearchOutcomes` is not run: showing a list is not a fact about the claim,
 * and a re-fetch that rewrote the source's row would turn looking into acting.
 */
export async function offerPick(
  d: PickDeps, actor: Actor, business_id: string, source_id: string,
): Promise<PickOffer> {
  assertResearchSection(actor, 'research.run');
  authorise(actor, 'research.run', { type: 'research', id: business_id, business_id });

  const empty = { source_id, publisher: '', candidates: [] as readonly ReviewCandidate[], already: null };
  const may = pickState(d, business_id, source_id);
  if (!may.ok) return { ok: false, why: may.why, ...empty };

  const already = lastPick(d.db, business_id, source_id);
  if (d.outside === undefined) {
    return { ok: false, why: 'Nothing was contacted, so there is no list to show.', ...empty, publisher: may.entry.publisher, already };
  }

  let offered: readonly ReviewCandidate[] = [];
  const free = freeGate();
  const engagement = assertSignedEngagement(d.db, business_id);
  await consultAllowed(
    d, actor, business_id,
    [{ entry: may.entry, ...stateUnderGates(may.entry, 'NOT_RUN', free, engagement) }],
    { free_gate_open: free.open, engagement_signed: engagement.signed === true },
    { [source_id]: { review: (o) => { offered = o.candidates; } } },
  );

  return offered.length === 0
    ? {
      ok: false, source_id, publisher: may.entry.publisher, already, candidates: [],
      why: 'The lookup has nothing close to this address to show now. It may have found something earlier and not ' +
        'now — try running the research again first.',
    }
    : {
      ok: true, source_id, publisher: may.entry.publisher, already, candidates: offered,
      why: `${offered.length} ${offered.length === 1 ? 'entry was' : 'entries were'} close to this address. ` +
        'None of them was close enough for us to choose one, so it is yours to choose — or to say none of them is this building.',
    };
}

/* ================================================================== *
 * 4 · TAKE THE CHOICE
 * ================================================================== */

export type PickResult = {
  readonly ok: boolean;
  readonly why: string;
  /** True where a record was stored. False for "none of them", and for every refusal. */
  readonly stored: boolean;
  readonly grade: Grade | null;
};

/**
 * THE GRADE THIS PICK MINTS. Derived from two things and typed nowhere: the source's own ceiling in the source
 * register, and the spec's cap while the thresholds are unmeasured. Worst of the two wins (invariant I-2).
 */
export function pickGrade(source_id: string): Grade {
  const max = REGISTER_SOURCES.find((s) => s.source_id === source_id)?.max_grade ?? 'E';
  return worstGrade([max, UNMEASURED_MATCH_GRADE_CAP]);
}

/**
 * ONE PERSON'S CHOICE, APPLIED.
 *
 * `chosen_key` is a candidate's own key in the register, or null for "none of them is this building". The key is not
 * trusted as an identifier of anything: the lookup is run again and the key is looked for in the list the register
 * gives us on THIS request. A key that is not in it keeps nothing.
 */
export async function takePick(
  d: PickDeps, actor: Actor, business_id: string, source_id: string, chosen_key: string | null,
): Promise<PickResult> {
  assertResearchSection(actor, 'research.run');
  authorise(actor, 'research.run', { type: 'research', id: business_id, business_id });

  const may = pickState(d, business_id, source_id);
  if (!may.ok) return { ok: false, why: may.why, stored: false, grade: null };

  const key = typeof chosen_key === 'string' && chosen_key.trim() !== '' ? chosen_key.trim() : null;
  const at = d.now();

  /* NONE OF THEM. A decision, recorded, that keeps no fact. The source stays FAILED — nothing was looked up — but
     its words now say a person has looked, so the next person does not repeat the work. */
  if (key === null) {
    d.db.tx(() => {
      writePick(d, business_id, source_id, { chosen_key: null, score: null, grade: null, record_id: null, actor, at });
      d.db.run(
        'UPDATE research_sources SET detail = ? WHERE business_id = ? AND source_id = ?',
        ['A person looked at the close entries. None of them is this building. ' +
          'So nothing was kept, and the questions stay asked.', business_id, source_id],
      );
    });
    d.audit.append({
      at, kind: 'REGISTER_MATCH_PICKED', outcome: 'ALLOWED',
      actor_id: actor.id, actor_role: actor.role,
      object_type: 'research', object_id: business_id,
      detail: { source_id, chosen: false, score: null, grade: null, stored: false },
    });
    return {
      ok: true, stored: false, grade: null,
      why: 'Noted — none of them is this building. Nothing was kept, and those questions stay asked.',
    };
  }

  if (d.outside === undefined) {
    return { ok: false, why: 'Nothing was contacted, so nothing was chosen.', stored: false, grade: null };
  }

  const free = freeGate();
  const engagement = assertSignedEngagement(d.db, business_id);
  let score: number | null = null;
  const [outcome] = await consultAllowed(
    d, actor, business_id,
    [{ entry: may.entry, ...stateUnderGates(may.entry, 'NOT_RUN', free, engagement) }],
    { free_gate_open: free.open, engagement_signed: engagement.signed === true },
    /* `picked` hands back what the chosen candidate scored on THIS fetch, so the decision's record carries a score
       without a third call to the supplier for a number we already had in front of us. */
    { [source_id]: { chosen: key, picked: (p) => { score = p.score; } } },
  );
  const got = outcome as SourceOutcome | undefined;
  if (got === undefined || got.state !== 'FIRED' || got.bundle === null) {
    return {
      ok: false, stored: false, grade: null,
      why: got?.detail ?? 'The lookup did not work, so nothing was kept.',
    };
  }

  const grade = pickGrade(source_id);
  const entityId = got.bundle.records[0]?.entityId ?? null;
  let record_id: string | null = null;
  d.db.tx(() => {
    storeResearchOutcomes(d, business_id, [got], at);
    record_id = entityId === null ? null : (d.db.get<{ id: string }>(
      'SELECT id FROM register_records WHERE business_id = ? AND source_id = ? AND entity_id = ?',
      [business_id, source_id, entityId],
    )?.id ?? null);
    writePick(d, business_id, source_id, { chosen_key: key, score, grade, record_id, actor, at });
  });

  d.audit.append({
    at, kind: 'REGISTER_MATCH_PICKED', outcome: 'ALLOWED',
    actor_id: actor.id, actor_role: actor.role,
    object_type: 'research', object_id: business_id,
    detail: { source_id, chosen: true, score, grade, stored: record_id !== null },
  });

  return {
    ok: true, stored: true, grade,
    why: `Chosen. We keep what that entry says. The file marks it confidence ${grade}. ` +
      'That is one step down, because a person chose it and we did not match it.',
  };
}

/** One pick row, replacing this client's last one for this source. The chain keeps every one of them; this is where it landed. */
function writePick(
  d: PickDeps, business_id: string, source_id: string,
  p: {
    readonly chosen_key: string | null; readonly score: number | null; readonly grade: Grade | null;
    readonly record_id: string | null; readonly actor: Actor; readonly at: string;
  },
): void {
  d.db.run('DELETE FROM register_match_picks WHERE business_id = ? AND source_id = ?', [business_id, source_id]);
  d.db.run(
    'INSERT INTO register_match_picks (id, business_id, source_id, chosen_key, score, grade, record_id, picked_by, picked_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [d.newId(), business_id, source_id, p.chosen_key, p.score, p.grade, p.record_id, p.actor.id, p.at],
  );
}
