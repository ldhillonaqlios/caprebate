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
 * TAKING A PICK BACK — Phase 146j, 25 September 2026
 *
 * Once a choice lands, the lookup is FIRED and leaves the REVIEW band, so `pickState` refuses to offer the list again
 * — and it should, because at that point there is nothing to choose between. Until Phase 146j that made a wrong
 * choice permanent: another building's floor area, age band or sale price sat in the claim file with no way out.
 *
 * `takeBackPick` is the way out, and it is NOT a second pick screen. It is the shape Phase 139 uses for a fact
 * somebody ticked: a separate act, on the lookup's own row, that ASKS WHY and keeps the reason. It
 *
 *   · removes the ONE register record that pick wrote — found through `register_match_picks.record_id`, which the
 *     pick recorded when it wrote it, and NEVER by re-deriving which record it must have been;
 *   · puts the lookup back to FAILED, code MATCH_REVIEW, so the list can be offered again — with the earlier choice
 *     marked on it as taken back, and why, so the next person does not choose the same wrong building;
 *   · keeps the pick row, with who took it back, when and why, and the list of what to look at again. A decision
 *     that was made and reversed is two facts, not none;
 *   · and writes REGISTER_MATCH_TAKEN_BACK on the audit chain, carrying the reason.
 *
 * It refuses, and says why, where the record is not the pick's to remove: where we held that entry before the pick
 * (from an earlier lookup — the pick then wrote nothing, and since Phase 146j records no record_id for it), where the
 * record is not the one the lookup itself names, or where a person has already checked and approved a fact from it
 * (Phase 139). The tick comes off first, by its own act and with its own reason.
 *
 * And it does not un-derive silently. What was worked out FROM the record while it stood — a site area, the check of
 * who signed, a step the client was told was done, an issued report, a surveyor's job — is listed
 * (src/web/take-back.ts), kept on the pick row, and shown to the person who took it back.
 *
 * ONLY A PERSON WHO CAN RUN THE RESEARCH, AND ONLY WHILE THE ENGAGEMENT IS SIGNED — the same conditions as the pick,
 * asserted the same way. It does NOT need the pick's switch on: taking a choice back shows no list and calls nothing,
 * and a switch turned off after a wrong choice must not lock that choice into the file.
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
import { removeRegisterRecord } from '../stubs/registers.ts';
import {
  approvedFieldsOf, lookAgainAfter, lookAgainJson, lookAgainSummary, takeBackReason, type LookAgain,
} from './take-back.ts';

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
  /**
   * PHASE 146j: the choice most recently TAKEN BACK on this lookup, and why — so a person looking at the list again
   * can see which entry was chosen and found wrong. Null where no choice here was ever taken back.
   */
  readonly taken_back: TakenBackRecord | null;
};

export type TakenBackRecord = {
  readonly chosen_key: string;
  readonly reason: string;
  readonly taken_back_at: string;
};

export type PickRecord = {
  readonly chosen_key: string | null;
  readonly score: number | null;
  readonly grade: string | null;
  readonly picked_at: string;
  readonly picked_by: string;
};

/** The pick that STANDS on this lookup. A pick taken back is kept, and is not this. */
export function lastPick(db: Db, business_id: string, source_id: string): PickRecord | null {
  return db.get<PickRecord>(
    'SELECT chosen_key, score, grade, picked_at, picked_by FROM register_match_picks ' +
      'WHERE business_id = ? AND source_id = ? AND taken_back_at IS NULL',
    [business_id, source_id],
  ) ?? null;
}

/** PHASE 146j: the choice on this lookup most recently taken back, with why. */
export function lastTakenBack(db: Db, business_id: string, source_id: string): TakenBackRecord | null {
  return db.get<TakenBackRecord>(
    'SELECT chosen_key, taken_back_reason AS reason, taken_back_at FROM register_match_picks ' +
      'WHERE business_id = ? AND source_id = ? AND taken_back_at IS NOT NULL ORDER BY taken_back_at DESC, rowid DESC LIMIT 1',
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

  const empty = { source_id, publisher: '', candidates: [] as readonly ReviewCandidate[], already: null, taken_back: null };
  const may = pickState(d, business_id, source_id);
  if (!may.ok) return { ok: false, why: may.why, ...empty };

  const already = lastPick(d.db, business_id, source_id);
  const taken_back = lastTakenBack(d.db, business_id, source_id);
  if (d.outside === undefined) {
    return { ok: false, why: 'Nothing was contacted, so there is no list to show.', ...empty, publisher: may.entry.publisher, already, taken_back };
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
      ok: false, source_id, publisher: may.entry.publisher, already, taken_back, candidates: [],
      why: 'The lookup has nothing close to this address to show now. It may have found something earlier and not ' +
        'now — try running the research again first.',
    }
    : {
      ok: true, source_id, publisher: may.entry.publisher, already, taken_back, candidates: offered,
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
    /* PHASE 146j: RECORD THE RECORD THIS PICK WROTE, AND ONLY THAT. `storeResearchOutcomes` keeps a record already held
       as it was, and until Phase 146j the pick then named that older record as its own — so taking the pick back would
       have removed a record an earlier lookup wrote. Migration 042 always said NULL "where the register held the record
       already and it was left as it was"; now it is. */
    const heldBefore = entityId === null ? undefined : d.db.get<{ id: string }>(
      'SELECT id FROM register_records WHERE business_id = ? AND source_id = ? AND entity_id = ?',
      [business_id, source_id, entityId],
    );
    storeResearchOutcomes(d, business_id, [got], at);
    record_id = entityId === null || heldBefore !== undefined ? null : (d.db.get<{ id: string }>(
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

/**
 * One pick row, replacing this client's STANDING one for this source. The chain keeps every one of them; this is where
 * it landed. A pick that was TAKEN BACK is never replaced or deleted (Phase 146j): it is the record that a choice was
 * made and found wrong, and the next choice on the same lookup must not erase it.
 */
function writePick(
  d: PickDeps, business_id: string, source_id: string,
  p: {
    readonly chosen_key: string | null; readonly score: number | null; readonly grade: Grade | null;
    readonly record_id: string | null; readonly actor: Actor; readonly at: string;
  },
): void {
  d.db.run('DELETE FROM register_match_picks WHERE business_id = ? AND source_id = ? AND taken_back_at IS NULL', [business_id, source_id]);
  d.db.run(
    'INSERT INTO register_match_picks (id, business_id, source_id, chosen_key, score, grade, record_id, picked_by, picked_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [d.newId(), business_id, source_id, p.chosen_key, p.score, p.grade, p.record_id, p.actor.id, p.at],
  );
}

/* ================================================================== *
 * 5 · TAKE A PICK BACK — Phase 146j
 * ================================================================== */

export type TakeBackResult = {
  readonly ok: boolean;
  readonly why: string;
  /** Set where the refusal is about one field of the form, so the screen can draw it there. */
  readonly field?: 'reason';
  /** True where the record the pick wrote was removed. False for every refusal. */
  readonly removed: boolean;
  /** What was worked out from the record while it stood and is still kept. Empty for a refusal. */
  readonly look_again: readonly LookAgain[];
};

const refused = (why: string, field?: 'reason'): TakeBackResult =>
  ({ ok: false, why, removed: false, look_again: [], ...(field === undefined ? {} : { field }) });

type StandingPick = {
  id: string; chosen_key: string | null; record_id: string | null; picked_at: string;
};

/**
 * TAKE BACK A PERSON'S PICK, WITH A REASON. See the header of this file for what it does and what it refuses.
 *
 * Every condition is read from the record on this request: which pick stands, which record it wrote, whether that
 * record was held before it, whether anybody approved a fact from it. Nothing in the request names a record — the
 * form carries the lookup and the reason, and nothing else.
 */
export function takeBackPick(
  d: PickDeps, actor: Actor, business_id: string, source_id: string, reasonIn: string | null,
): TakeBackResult {
  assertResearchSection(actor, 'research.run');
  authorise(actor, 'research.run', { type: 'research', id: business_id, business_id });

  const engagement = assertSignedEngagement(d.db, business_id);
  if (!engagement.signed) {
    return refused('Taking back a choice is done while the engagement letter is signed — ' + engagement.why + '.');
  }

  const pick = d.db.get<StandingPick>(
    'SELECT id, chosen_key, record_id, picked_at FROM register_match_picks WHERE business_id = ? AND source_id = ? AND taken_back_at IS NULL',
    [business_id, source_id],
  );
  if (pick === undefined || pick.chosen_key === null) {
    return refused('There is no choice to take back on that lookup. Nobody has chosen one of its entries, or the choice was “none of them”.');
  }
  if (pick.record_id === null) {
    return refused('That choice kept nothing of its own. We already held that entry from an earlier lookup, so it was left as it was, ' +
      'and there is nothing of the choice’s to take out. Nothing was changed.');
  }
  const rec = d.db.get<{ id: string; source_id: string; obtained_at: string; property_id: string | null }>(
    'SELECT id, source_id, obtained_at, property_id FROM register_records WHERE id = ? AND business_id = ?',
    [pick.record_id, business_id],
  );
  if (rec === undefined || rec.source_id !== source_id) {
    return refused('The entry that choice kept is not where the choice says it is, so nothing was taken out. Nothing was changed.');
  }
  /* A RECORD ANOTHER LOOKUP WROTE IS NOT THE PICK'S TO REMOVE. A pick made before Phase 146j could name a record that
     was already held when it was made; one written before the pick was made is exactly that. */
  if (rec.obtained_at < pick.picked_at) {
    return refused('We held that entry before anybody chose it — an earlier lookup found it — so it is not the choice’s to take out. ' +
      'Nothing was changed.');
  }
  const approved = approvedFieldsOf(d.db, business_id, rec.id);
  if (approved.length > 0) {
    return refused(`A person has checked and approved ${approved.length === 1 ? 'a fact' : `${approved.length} facts`} from that entry. ` +
      'We do not take it out from under them. Take the tick off first, on the checks panel, with your reason — then take the choice back.');
  }

  const why = takeBackReason(reasonIn);
  if (!why.ok) return refused(why.why, 'reason');

  const look = lookAgainAfter(d.db, business_id, rec);
  const at = d.now();
  d.db.tx(() => {
    /* The pick lets go of the record FIRST: its record_id is a foreign key, and a key to a deleted row is a violation. */
    d.db.run(
      'UPDATE register_match_picks SET record_id = NULL, removed_record_id = ?, taken_back_at = ?, taken_back_by = ?, ' +
        'taken_back_reason = ?, look_again_json = ? WHERE id = ?',
      [rec.id, at, actor.id, why.reason, lookAgainJson(look), pick.id],
    );
    if (!removeRegisterRecord(d.db, business_id, rec.id)) throw new Error('the record the pick wrote was not removed');
    d.db.run(
      "UPDATE research_sources SET state = 'FAILED', failure_code = ?, retrieved_at = NULL, detail = ? WHERE business_id = ? AND source_id = ?",
      /* The lookup's own line on the panel says what to look at again, so it is in front of whoever opens the panel
         next and not only of the person who took it back. The same list is kept on the pick row, as kinds and counts. */
      [PICKABLE_FAILURE_CODE, 'A person took back the entry chosen here. Nothing from it is kept, its questions are asked again, ' +
        'and the close entries can be looked at again.' +
        (look.length === 0 ? '' : ` ${lookAgainSummary(look)} ${look.map((l) => l.words).join(' ')}`), business_id, source_id],
    );
    d.audit.append({
      at, kind: 'REGISTER_MATCH_TAKEN_BACK', outcome: 'ALLOWED',
      actor_id: actor.id, actor_role: actor.role,
      object_type: 'research', object_id: business_id,
      detail: { source_id, reason: why.reason, removed: true, look_again: look.map((l) => `${l.kind}:${l.count}`).join(',') },
    });
  });

  return {
    ok: true, removed: true, look_again: look,
    why: 'Taken back. The entry that choice kept is gone, its questions are asked again, and the close entries can be looked at again. ' +
      lookAgainSummary(look),
  };
}

/** The take-backs on one lookup, newest first, for a screen or a test. Kinds and counts only. */
export function takenBackPicks(db: Db, business_id: string, source_id: string): readonly {
  readonly chosen_key: string; readonly taken_back_at: string; readonly taken_back_by: string; readonly reason: string;
  readonly removed_record_id: string | null; readonly look_again: readonly { kind: string; count: number }[];
}[] {
  return db.all<{ chosen_key: string; taken_back_at: string; taken_back_by: string; reason: string; removed_record_id: string | null; look_again_json: string | null }>(
    'SELECT chosen_key, taken_back_at, taken_back_by, taken_back_reason AS reason, removed_record_id, look_again_json FROM register_match_picks ' +
      'WHERE business_id = ? AND source_id = ? AND taken_back_at IS NOT NULL ORDER BY taken_back_at DESC, rowid DESC',
    [business_id, source_id],
  ).map(({ look_again_json, ...r }) => ({ ...r, look_again: JSON.parse(look_again_json ?? '[]') as { kind: string; count: number }[] }));
}
