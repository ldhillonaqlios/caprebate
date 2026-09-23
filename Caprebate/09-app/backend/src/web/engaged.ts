/**
 * ENGAGED CLIENTS, AND THE BUSINESS PAGE — panels 1, 3, 4 and 5.
 *
 * Panel 2 (sources, and the two gates) is src/web/research.ts. The renderers
 * and routes are src/web/engaged-pages.ts. VIEW MODELS ONLY here: every
 * function takes an ACTOR, authorises on the SPECIFIC OBJECT before it reads,
 * and returns what that actor may see — the same discipline as portal.ts and
 * backoffice.ts, for the same reason.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE ONE THING THE LIST IS FOR
 *
 * "It must be obvious at a glance which are waiting on US and which are waiting
 * on the CLIENT — that distinction is the whole point of the section."
 *
 * So `waitingOn` is not a column derived from a stage name. It is computed from
 * four real facts — whether a letter has been raised and sent, whether it is
 * signed, whether an open question has actually been PUT to the client, and
 * whether anything is outstanding on our side — and it carries the sentence
 * that explains itself. A stage is where a claim has got to; who is holding it
 * up is a different question and the two answers routinely disagree.
 *
 * WHERE BOTH ARE TRUE, IT READS AS OURS. A claim where we owe the client
 * something AND they owe us something is a claim a staff member should open.
 * The row still says the client has an open question, so nothing is hidden —
 * but the queue a person works down is the queue of things they can act on.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PANEL 3 IS DERIVED, AND THAT IS THE REQUIREMENT
 *
 * "DERIVED from what the engine says it still needs, not from a hand-written
 * checklist that will drift."
 *
 * Three derivations, no list:
 *   · CB_REGISTRY.derive() returns `ask` and `why` — every register fact that
 *     is still a question, with the engine's own reason. Today the free gate is
 *     shut, so it returns ALL of them and says so in `why.__layer`.
 *   · the assessment's own answers in DONT_KNOW or SKIPPED state — facts the
 *     client was asked for and did not give, which the schema stores as states
 *     rather than blanks precisely so this list can be built.
 *   · the engine result's cash gates that are `null` — NOT ESTABLISHED, which
 *     N4 says must never be read as either open or shut.
 *
 * WHAT EACH ONE BLOCKS IS CLASSIFIED, AND IT FAILS CLOSED TO BOTH. The list
 * cannot drift because it is computed; the attribution is a small map over that
 * computed list, and anything it does not recognise is reported as blocking
 * BOTH packs rather than neither. Over-reporting a blocker is recoverable;
 * under-reporting one is how a pack goes out incomplete. There is a test that
 * an unrecognised fact comes back BOTH.
 */

import type { Db } from '../db.ts';
import { authorise, can, type Actor } from '../authz.ts';
import type { AuditLog } from '../audit.ts';
import { REGISTRY, estimate, type SectorId } from './engine.ts';
import { funnelStateFor, sessionFromFunnel } from './funnel-session.ts';
import { SCREENS, type ScreenId } from './assessment.ts';
import { formatShownRange } from './shown-range.ts';
import { stage as stageOf } from './stages.ts';
import { answerLabel, NotFoundAsRefusal } from './backoffice.ts';
import { RECEIVED_ONLY_BY_UPLOAD } from './documents.ts';
import { DERIVE_FIELD_OF } from '../connectors/free-registers.ts';
import {
  assertSignedEngagement, catalogue, LETTER_WORDS, REGISTRY_ID_OF, type SignedEngagement,
} from './research.ts';

export { NotFoundAsRefusal };

/**
 * THE SECTION GATE — asked as an object question, as backoffice.ts explains.
 *
 * IT IS `research.read`, AND THE CHOICE MATTERS. The first version of this
 * gated on `business.read`, which reads like the obvious rule for a page about
 * businesses and lets in two roles that should not be here:
 *
 *   ACCOUNTING is on `business.read` because it needs a client's NAME for an
 *   invoice, and that is the whole of what it may know about them — settled
 *   6 September 2026. It is not on assessment.read, answer.read,
 *   register_record.read or internal_note.read, so it would have entered this
 *   page and been refused by panel 1 the moment it tried to draw.
 *
 *   SURVEYING is not on `business.read` at all, so it was refused — correctly,
 *   but for a reason that would have been an accident rather than a decision.
 *   A surveyor's view of a job is the QUARANTINED workspace, which is a
 *   different screen with a different rule; this page carries our estimate,
 *   the research and the internal notes, and none of those is theirs.
 *
 * `research.read` is ADMIN and SALES, which is exactly who works a claim, and
 * it is the rule the centre of this page (panel 2) already turns on. One rule,
 * for the section and for the thing the section is for.
 */
const CLIENTS_SECTION = '__engaged_clients__';

export function assertClientsSection(actor: Actor): void {
  authorise(actor, 'research.read', {
    type: 'research', id: CLIENTS_SECTION, business_id: CLIENTS_SECTION,
  });
}

/* ================================================================== *
 * THE LIST
 * ================================================================== */

export type ResearchProgress = 'NOT_RUN' | 'PART_RUN' | 'COMPLETE';
export type WaitingOn = 'US' | 'CLIENT' | 'NOBODY';

export type ClientRow = {
  readonly business_id: string;
  readonly name: string;
  readonly sector: string;
  readonly stage: string;
  /** The stage in the client's own words, or a marker where the stage is unknown. */
  readonly stage_label: string;
  readonly letter_state: SignedEngagement['letter_state'];
  readonly letter_label: string;
  readonly research: ResearchProgress;
  readonly research_label: string;
  /** Open questions with the client. `sent` is the subset they can actually see. */
  readonly tasks_open: number;
  readonly tasks_sent: number;
  readonly missing_facts: number;
  readonly ready_for_accountant: boolean;
  readonly ready_for_surveyor: boolean;
  readonly done: boolean;
  readonly waiting_on: WaitingOn;
  /** Why, in one sentence. Read aloud on the telephone; never a code. */
  readonly waiting_why: string;
  /** True where the client also owes us something and we owe them something. */
  readonly also_with_client: boolean;
  readonly submitted_at: string | null;
};

const RESEARCH_WORDS: Readonly<Record<ResearchProgress, string>> = Object.freeze({
  NOT_RUN: 'not run',
  PART_RUN: 'part run',
  COMPLETE: 'complete',
});

/**
 * How far the research has got.
 *
 * MEASURED AGAINST THE CATALOGUE, NOT AGAINST THE ROWS THAT EXIST. "Complete"
 * has to mean every source this system consults has fired — not every source
 * somebody happened to write a row for. Counting rows would let the research
 * read complete because nobody had inserted the ones that had not run, which is
 * the exact shape of defect this project keeps finding in its own counts.
 */
export function researchProgress(db: Db, business_id: string): ResearchProgress {
  const total = catalogue().length;
  const row = db.get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM research_sources WHERE business_id = ? AND state = ?',
    [business_id, 'FIRED'],
  );
  const fired = row?.n ?? 0;
  if (fired === 0) return 'NOT_RUN';
  return fired >= total ? 'COMPLETE' : 'PART_RUN';
}

/**
 * Every client in the pipeline, and who is holding each one up.
 *
 * AUTHORISED ONE ROW AT A TIME. A list that authorised the action and then
 * returned every row would be a role check, and this application does not have
 * one — see `filedAssessments` in backoffice.ts, which this follows.
 */
export function engagedClients(db: Db, actor: Actor, limit = 200): ClientRow[] {
  assertClientsSection(actor);

  const rows = db.all<{
    business_id: string; name: string; sector: string; stage: string; submitted_at: string | null;
  }>(
    'SELECT b.id AS business_id, b.name, b.sector, b.stage, ' +
      '(SELECT MAX(a.submitted_at) FROM assessments a WHERE a.business_id = b.id) AS submitted_at ' +
      'FROM businesses b ORDER BY b.created_at DESC, b.name ASC LIMIT ?',
    [limit],
  );

  const out: ClientRow[] = [];
  for (const b of rows) {
    if (!can(actor, 'business.read', { type: 'business', id: b.business_id })) continue;
    out.push(clientRow(db, actor, b));
  }
  return out;
}

function clientRow(
  db: Db, actor: Actor,
  b: { business_id: string; name: string; sector: string; stage: string; submitted_at: string | null },
): ClientRow {
  const eng = assertSignedEngagement(db, b.business_id);
  const research = researchProgress(db, b.business_id);
  const tasks = taskCounts(db, b.business_id);
  const missing = missingFacts(db, actor, b.business_id);
  const done = b.stage === 'PAID';

  const blockingAccountant = missing.filter((m) => m.blocks !== 'SURVEYOR').length;
  const blockingSurveyor = missing.filter((m) => m.blocks !== 'ACCOUNTANT').length;

  const w = whoIsWaiting({
    done, letter: eng, research, tasks,
    missing_without_task: missing.filter((m) => !m.has_task).length,
  });

  return {
    business_id: b.business_id, name: b.name, sector: b.sector, stage: b.stage,
    stage_label: stageOf(b.stage)?.label ?? 'stage unknown — open the claim to check',
    letter_state: eng.letter_state,
    letter_label: LETTER_WORDS[eng.letter_state] ?? eng.letter_state,
    research, research_label: RESEARCH_WORDS[research],
    tasks_open: tasks.open, tasks_sent: tasks.sent,
    missing_facts: missing.length,
    // READY MEANS NOTHING IS OUTSTANDING FOR THAT PACK. Not "nearly", and not
    // "the stage says so": a pack is ready when no fact it needs is missing.
    ready_for_accountant: blockingAccountant === 0,
    ready_for_surveyor: blockingSurveyor === 0,
    done,
    waiting_on: w.who, waiting_why: w.why, also_with_client: w.also_with_client,
    submitted_at: b.submitted_at,
  };
}

/**
 * WHO IS WAITING ON ONE ORGANISATION — the same `clientRow` the list builds, and
 * so the same `whoIsWaiting`, where both sides waiting reads as ours. CRM 3 of 10
 * asks this for a claim's next action and for the list of claims breaking the
 * one-next-action rule; it does not have a ladder of its own.
 *
 * NULL for a reader the engaged-client list would not admit, because the answer
 * is built from the missing list, the questions and the letter.
 */
export function waitingOn(db: Db, actor: Actor, business_id: string): { who: WaitingOn; why: string } | null {
  if (!can(actor, 'research.read', { type: 'research', id: business_id, business_id })) return null;
  const b = db.get<{ business_id: string; name: string; sector: string; stage: string; submitted_at: string | null }>(
    'SELECT b.id AS business_id, b.name, b.sector, b.stage, ' +
      '(SELECT MAX(a.submitted_at) FROM assessments a WHERE a.business_id = b.id) AS submitted_at ' +
      'FROM businesses b WHERE b.id = ?',
    [business_id],
  );
  if (b === undefined || !can(actor, 'business.read', { type: 'business', id: b.business_id })) return null;
  const row = clientRow(db, actor, b);
  return { who: row.waiting_on, why: row.waiting_why };
}

export type TaskCounts = { readonly open: number; readonly sent: number; readonly answered: number };

export function taskCounts(db: Db, business_id: string): TaskCounts {
  const r = db.get<{ open: number; sent: number; answered: number }>(
    'SELECT ' +
      "SUM(CASE WHEN state = 'OPEN' THEN 1 ELSE 0 END) AS open, " +
      "SUM(CASE WHEN state = 'OPEN' AND sent_to_portal_at IS NOT NULL THEN 1 ELSE 0 END) AS sent, " +
      "SUM(CASE WHEN state = 'ANSWERED' THEN 1 ELSE 0 END) AS answered " +
      'FROM client_tasks WHERE business_id = ?',
    [business_id],
  );
  return { open: r?.open ?? 0, sent: r?.sent ?? 0, answered: r?.answered ?? 0 };
}

/**
 * WHO IS HOLDING THIS UP. The whole point of the section, in one function.
 *
 * WRITTEN AS A LADDER OF FACTS RATHER THAN A LOOKUP ON THE STAGE, because the
 * stage is where a claim has GOT TO and this is who is stopping it, and a claim
 * routinely sits at ENGAGEMENT_SIGNED with three questions unanswered by the
 * client and nothing at all for us to do. A column that read the stage would
 * have called that one ours.
 *
 * A QUESTION THE CLIENT CANNOT SEE IS NOT WAITING ON THE CLIENT. That is the
 * line this function exists for. A task drafted in the back office and never
 * sent to the portal is OURS — nobody has asked them anything. The distinction
 * is `sent_to_portal_at`, which is exactly why migration 005 records it.
 */
export function whoIsWaiting(f: {
  done: boolean;
  letter: SignedEngagement;
  research: ResearchProgress;
  tasks: TaskCounts;
  missing_without_task: number;
}): { who: WaitingOn; why: string; also_with_client: boolean } {
  const withClient =
    f.tasks.sent > 0 ||
    f.letter.letter_state === 'SENT' ||
    f.letter.letter_state === 'VIEWED';

  if (f.done) {
    return { who: 'NOBODY', why: 'filed and settled — nothing outstanding on either side', also_with_client: false };
  }

  // OURS, in the order a staff member would act on them.
  const ours: string | null =
    f.letter.letter_state === 'NONE'
      ? 'no engagement letter has been raised yet'
      : f.letter.letter_state === 'NOT_SENT'
        ? 'the engagement letter is drafted and has not been sent'
        : f.tasks.open > f.tasks.sent
          ? `${f.tasks.open - f.tasks.sent} question${f.tasks.open - f.tasks.sent === 1 ? ' has' : 's have'} been drafted and not put to the client`
          : f.missing_without_task > 0
            ? `${f.missing_without_task} fact${f.missing_without_task === 1 ? ' is' : 's are'} still missing and nobody has asked for ${f.missing_without_task === 1 ? 'it' : 'them'}`
            : f.letter.signed && f.research === 'NOT_RUN'
              ? 'the engagement is signed and the research has not been run'
              : null;

  if (ours !== null) {
    return {
      who: 'US',
      why: withClient ? `${ours} — and the client also has something with them` : ours,
      also_with_client: withClient,
    };
  }

  if (withClient) {
    const why =
      f.tasks.sent > 0
        ? `${f.tasks.sent} question${f.tasks.sent === 1 ? '' : 's'} ${f.tasks.sent === 1 ? 'is' : 'are'} with the client, unanswered`
        : `the engagement letter is ${LETTER_WORDS[f.letter.letter_state] ?? f.letter.letter_state} and is not signed`;
    return { who: 'CLIENT', why, also_with_client: true };
  }

  return { who: 'NOBODY', why: 'nothing is outstanding on either side right now', also_with_client: false };
}

/* ================================================================== *
 * PANEL 1 — QUESTIONS AND ANSWERS
 * ================================================================== */

export type QaRow = {
  readonly ord: number;
  readonly question_id: string;
  readonly question_text: string;
  readonly state: 'ANSWERED' | 'DONT_KNOW' | 'SKIPPED';
  readonly value: string | null;
  readonly label: string;
};

/**
 * Everything they told us, in the order asked.
 *
 * IT IS THE SAME `answerLabel` THE ASSESSMENTS SCREEN USES, and the same rows
 * in the same order, because "the client's view and the staff view of the same
 * number never differ" is not only about the money. A skipped question shows as
 * skipped and "I don't know" shows as an answer, on both sides, from one
 * function — and there is no code path here that produces an empty cell.
 */
export function questionsAndAnswers(db: Db, actor: Actor, business_id: string): {
  readonly assessment_id: string | null;
  readonly submitted_at: string | null;
  readonly range: string | null;
  readonly rows: readonly QaRow[];
  readonly answered: number;
  readonly dont_know: number;
  readonly skipped: number;
} {
  const a = latestAssessment(db, business_id);
  if (a === undefined) {
    return { assessment_id: null, submitted_at: null, range: null, rows: [], answered: 0, dont_know: 0, skipped: 0 };
  }
  authorise(actor, 'assessment.read', { type: 'assessment', id: a.id, business_id });

  const rows = db.all<{
    ord: number; question_id: string; question_text: string; state: string; value: string | null;
  }>(
    'SELECT ord, question_id, question_text, state, value FROM assessment_answers ' +
      'WHERE assessment_id = ? ORDER BY ord ASC',
    [a.id],
  );
  for (const r of rows) {
    authorise(actor, 'answer.read', { type: 'answer', id: `${a.id}:${r.ord}`, business_id });
  }

  // THE FIGURE IS READ ONLY WHERE IT MAY BE SHOWN — built forwards, never read
  // and then hidden. Same discipline as backoffice.ts and payload.ts.
  const maySeeFigure = can(actor, 'estimate.read', { type: 'estimate', id: a.id, business_id });

  const qa: QaRow[] = rows.map((r) => ({
    ord: r.ord, question_id: r.question_id, question_text: r.question_text,
    state: r.state as QaRow['state'], value: r.value,
    label: answerLabel(r.state, r.value),
  }));

  return {
    assessment_id: a.id,
    submitted_at: a.submitted_at,
    range: maySeeFigure
      ? formatShownRange({ low_pence: a.shown_low_pence, high_pence: a.shown_high_pence })
      : null,
    rows: qa,
    answered: qa.filter((x) => x.state === 'ANSWERED').length,
    dont_know: qa.filter((x) => x.state === 'DONT_KNOW').length,
    skipped: qa.filter((x) => x.state === 'SKIPPED').length,
  };
}

type AssessmentRow = {
  id: string; sector: string; submitted_at: string;
  shown_low_pence: number | null; shown_high_pence: number | null;
};

function latestAssessment(db: Db, business_id: string): AssessmentRow | undefined {
  return db.get<AssessmentRow>(
    'SELECT id, sector, submitted_at, shown_low_pence, shown_high_pence FROM assessments ' +
      'WHERE business_id = ? ORDER BY submitted_at DESC, id DESC LIMIT 1',
    [business_id],
  );
}

/* ================================================================== *
 * PANEL 3 — WHAT IS STILL MISSING
 * ================================================================== */

export type Blocks = 'ACCOUNTANT' | 'SURVEYOR' | 'BOTH';

export type MissingFact = {
  /** The registry field id, the assessment question id, or the gate name. */
  readonly fact_id: string;
  /** Where this came from, so a reader can see it was derived. */
  readonly origin: 'register' | 'answer' | 'cash gate';
  /** The question in plain English. From the engine's own text wherever it has one. */
  readonly question: string;
  /** The engine's own reason, verbatim where it gives one. */
  readonly why: string;
  readonly blocks: Blocks;
  /** True where the attribution fell through to BOTH because nothing recognised it. */
  readonly blocks_by_default: boolean;
  /** True where a task already exists asking for this fact. */
  readonly has_task: boolean;
  readonly task_state: 'OPEN' | 'ANSWERED' | 'WITHDRAWN' | null;
  /**
   * PHASE 138 — WHICH SECTION OF THE CLIENT PAGE ASKS FOR IT, AND WHERE IT COMES FROM, in words. Read from the same
   * source and screen the pack attribution above reads, never typed per fact: Companies House describes the company;
   * EPC, the valuation office, the care regulator and the land registry describe the property; the client's own answers
   * are the property where the screen is the property or the works, and the claim's facts otherwise.
   */
  readonly section: 'company' | 'property' | 'facts';
  readonly from: string;
};

/** PHASE 138: a register source's section on the client page, and its name in words. A source not here is the claim's facts. */
const SECTION_BY_REGISTRY_SOURCE: Readonly<Record<string, { section: MissingFact['section']; from: string }>> = Object.freeze({
  companies_house: { section: 'company', from: 'Companies House' },
  epc: { section: 'property', from: 'the EPC register' },
  voa: { section: 'property', from: 'the valuation office' },
  cqc: { section: 'property', from: 'the care regulator' },
  hmlr: { section: 'property', from: 'HM Land Registry' },
});

/** PHASE 138: the screens whose unanswered questions describe the property. Every other screen is the claim's facts. */
const PROPERTY_SCREEN_GROUPS: readonly string[] = Object.freeze(['The property', 'Works']);

/**
 * PHASE 139 — WHICH SECTION A FACT BELONGS TO, FROM THE FACT ITSELF. The same two readings the missing list makes — a
 * register field by the source that supplies it, an assessment question by its screen — so an answered fact, which has
 * left the missing list, is still put in the same place.
 */
export function sectionOfFact(fact_id: string): MissingFact['section'] {
  const source = (REGISTRY.FIELDS as Record<string, { source?: string } | undefined>)[fact_id]?.source;
  if (source !== undefined) return SECTION_BY_REGISTRY_SOURCE[source]?.section ?? 'facts';
  const screen = screenOf(fact_id);
  const group = screen === null ? null : SCREENS[screen].group;
  return group !== null && PROPERTY_SCREEN_GROUPS.includes(group) ? 'property' : 'facts';
}

/**
 * WHICH PACK A REGISTER FACT BLOCKS, BY THE SOURCE THAT WOULD SUPPLY IT.
 *
 * Not per field: the source is what makes the attribution principled. EPC, the
 * valuation office and the care regulator describe the BUILDING, which is the
 * surveyor's subject. Companies House describes the TAXPAYER, which is the
 * accountant's. The land registry describes the TRANSACTION — price paid, the
 * completion date, tenure — and `RELEASED_TO_SURVEYOR_ALWAYS` in
 * caprebate-anchor-quarantine.ts lists "title, tenure, price paid, completion
 * date" among what a surveyor always receives, while the same facts set the
 * expenditure the computation is applied to. So it is genuinely BOTH.
 *
 * A SOURCE THIS MAP DOES NOT KNOW GIVES BOTH. See the header.
 */
const BLOCKS_BY_REGISTRY_SOURCE: Readonly<Record<string, Blocks>> = Object.freeze({
  epc: 'SURVEYOR',
  voa: 'SURVEYOR',
  cqc: 'SURVEYOR',
  companies_house: 'ACCOUNTANT',
  hmlr: 'BOTH',
});

/**
 * WHICH PACK AN UNANSWERED FUNNEL QUESTION BLOCKS, BY THE SCREEN IT CAME FROM.
 *
 * The screen groups are already declared in src/web/assessment.ts, transcribed
 * from the site's own renderer — so this reads an existing classification
 * rather than inventing a second one. The two tax-position screens are the
 * accountant's; the property and works screens describe the building and its
 * expenditure and are both.
 *
 * A QUESTION ID THAT DOES NOT RESOLVE TO A SCREEN GIVES BOTH.
 */
const BLOCKS_BY_SCREEN_GROUP: Readonly<Record<string, Blocks>> = Object.freeze({
  'About any earlier claim': 'ACCOUNTANT',
  'Your tax position': 'ACCOUNTANT',
  'What prompted this': 'BOTH',
  'The property': 'BOTH',
  Works: 'BOTH',
});

/** The four cash gates are the tax position, and the tax position is the accountant's. */
const BLOCKS_BY_CASH_GATE: Readonly<Record<string, Blocks>> = Object.freeze({
  profits: 'ACCOUNTANT',
  aiaHeadroom: 'ACCOUNTANT',
  poolBalances: 'ACCOUNTANT',
  priorClaims: 'ACCOUNTANT',
});

const CASH_GATE_QUESTION: Readonly<Record<string, string>> = Object.freeze({
  profits: 'Are there profits for the relief to bite on?',
  aiaHeadroom: 'How much Annual Investment Allowance headroom is left this period?',
  poolBalances: 'What are the existing capital allowances pool balances?',
  priorClaims: 'Has anyone claimed on these fixtures before?',
});

/** A question id back to the screen it came from. `Q2-3-spend` is a Q2 question. */
export function screenOf(question_id: string): ScreenId | null {
  const head = question_id.split('-')[0] ?? '';
  const id = head === 'Q1b' && question_id.includes('profit') ? 'Q1b' : head;
  return (Object.prototype.hasOwnProperty.call(SCREENS, id) ? (id as ScreenId) : null);
}

/**
 * What the engine still needs, for one client.
 *
 * NOTHING HERE GUESSES A FACT AND NOTHING ROUTES AN UNKNOWN TO A BRANCH. The
 * session handed to the engine carries only what the client actually answered:
 * a DONT_KNOW or a SKIPPED row sets nothing, so `aia_headroom` stays absent and
 * the cash gate comes back `null`, which is precisely the state N4 requires and
 * precisely what this panel is reporting. Seeding the session with a plausible
 * default would empty this list by making the engine sure of things nobody told
 * it — which is the failure mode this whole discipline exists to prevent.
 */
export function missingFacts(db: Db, actor: Actor, business_id: string): MissingFact[] {
  const a = latestAssessment(db, business_id);

  /**
   * GATED ON `assessment.read`, AND IT WAS `business.read` UNTIL PHASE 107.
   *
   * That was wrong in both directions, and the surveyor workspace is what
   * exposed it. This list is derived from three things and nothing else: the
   * assessment's own answers, the register records, and the engine's cash
   * gates. `business.read` admits ACCOUNTING — which may read NONE of those
   * three, by the decision of 6 September 2026 — and refuses SURVEYING, which
   * may read ALL of them: it is on assessment.read, answer.read and
   * register_record.read. So the old gate let in the role that must not see
   * the list and kept out the role whose own pack half of it blocks.
   *
   * Nothing that already called this changes: `businessPage` sits behind
   * `research.read`, which is ADMIN and SALES, and both are on this rule too.
   *
   * THE ID IS NOT LOAD-BEARING and the synthetic one says so. The rule turns
   * on the ROLE and on `business_id`; no rule for this action reads `id`. The
   * same idiom is three functions above, where an answer's authorisation
   * object is built as `${assessment}:${ord}`.
   */
  authorise(actor, 'assessment.read', {
    type: 'assessment', id: a?.id ?? `${business_id}:no-assessment`, business_id,
  });

  const out: MissingFact[] = [];

  const tasks = new Map(
    db.all<{ fact_id: string | null; state: string; answer_state: string | null }>(
      'SELECT fact_id, state, answer_state FROM client_tasks WHERE business_id = ? AND fact_id IS NOT NULL',
      [business_id],
    ).map((t) => [t.fact_id ?? '', t] as const),
  );

  /**
   * WHETHER A FACT HAS BEEN ASKED FOR, AND WHETHER THAT SETTLED IT.
   *
   * `settled` IS THE ONE THAT MATTERS AND IT IS NOT THE SAME AS `ANSWERED`.
   *
   *   ANSWERED with a value      the fact is supplied. It stops being missing.
   *   ANSWERED "I don't know"    the client TOLD US SOMETHING and the fact is
   *                              STILL MISSING. That is N4: "I don't know" is a
   *                              first-class answer and it is not the fact.
   *   OPEN                       asked, not answered. Still missing.
   *   WITHDRAWN                  not a task at all. The fact is outstanding
   *                              again, or withdrawing a question would quietly
   *                              hide the fact it was asking about.
   *
   * THE MIDDLE CASE IS THE WHOLE POINT. A build that dropped a fact the moment
   * a task closed would let a claim read "ready for the accountant pack"
   * because somebody had asked a question and been told nobody knew the answer.
   */
  const taskFor = (fact_id: string): {
    has_task: boolean; task_state: MissingFact['task_state']; settled: boolean; dont_know: boolean;
  } => {
    const t = tasks.get(fact_id);
    if (t === undefined) return { has_task: false, task_state: null, settled: false, dont_know: false };
    if (t.state === 'WITHDRAWN') return { has_task: false, task_state: 'WITHDRAWN', settled: false, dont_know: false };
    const dontKnow = t.state === 'ANSWERED' && t.answer_state === 'DONT_KNOW';
    return {
      has_task: true,
      task_state: t.state as MissingFact['task_state'],
      settled: t.state === 'ANSWERED' && t.answer_state === 'ANSWERED',
      dont_know: dontKnow,
    };
  };

  /** The sentence a fact carries once somebody has asked about it. */
  const askedWhy = (t: ReturnType<typeof taskFor>, base: string): string =>
    t.dont_know
      ? 'we asked, and the client does not know — so it is still missing, and it will have to come ' +
        'from a document, the survey or a register'
      : t.has_task
        ? `${base} — a question has been put and is not yet answered`
        : base;

  /* ---- 1. the register layer's own list, with its own reasons ---- */
  const bundle = registerBundle(db, business_id);
  const derived = REGISTRY.derive(bundle, { sector: a?.sector ?? null });
  const fields = REGISTRY.FIELDS;
  const layerWhy = derived.why['__layer'] ?? null;

  for (const f of derived.ask) {
    const t = taskFor(f);
    if (t.settled) continue; // supplied by one of the two routes; no longer missing
    const spec = fields[f];
    const source = spec?.source ?? '';
    const known = Object.prototype.hasOwnProperty.call(BLOCKS_BY_REGISTRY_SOURCE, source);
    out.push({
      fact_id: f,
      origin: 'register',
      question: spec?.retires ?? f,
      why: askedWhy(t, derived.why[f] ?? layerWhy ?? 'the public registers have not given us this'),
      blocks: known ? (BLOCKS_BY_REGISTRY_SOURCE[source] as Blocks) : 'BOTH',
      blocks_by_default: !known,
      has_task: t.has_task, task_state: t.task_state,
      ...(SECTION_BY_REGISTRY_SOURCE[source] ?? { section: 'facts' as const, from: 'a public register' }),
    });
  }

  /* ---- 2. what the client was asked and did not give ---- */
  if (a !== undefined) {
    const rows = db.all<{ question_id: string; question_text: string; state: string }>(
      'SELECT question_id, question_text, state FROM assessment_answers ' +
        "WHERE assessment_id = ? AND state <> 'ANSWERED' ORDER BY ord ASC",
      [a.id],
    );
    for (const r of rows) {
      const t = taskFor(r.question_id);
      if (t.settled) continue;
      const screen = screenOf(r.question_id);
      const group = screen === null ? null : SCREENS[screen].group;
      const known = group !== null && Object.prototype.hasOwnProperty.call(BLOCKS_BY_SCREEN_GROUP, group);
      out.push({
        fact_id: r.question_id,
        origin: 'answer',
        question: r.question_text,
        why: askedWhy(t, r.state === 'DONT_KNOW'
          ? 'the client was asked and said they do not know'
          : 'this question was skipped, so it was never answered'),
        blocks: known ? (BLOCKS_BY_SCREEN_GROUP[group] as Blocks) : 'BOTH',
        blocks_by_default: !known,
        has_task: t.has_task, task_state: t.task_state,
        section: group !== null && PROPERTY_SCREEN_GROUPS.includes(group) ? 'property' : 'facts', from: 'the client',
      });
    }
  }

  /* ---- 3. the cash gates the engine could not establish ---- */
  const cash = unestablishedGates(db, a);

  /**
   * AN ENGINE THAT DID NOT RUN IS SAID SO, NOT PASSED OVER IN SILENCE.
   *
   * This was the one way the panel could UNDER-report, which the header
   * opposite says it cannot: `estimate()` throwing was caught and turned into
   * an empty list, so a business whose engine run failed showed the same
   * "no cash gates outstanding" as one where all four were established. Those
   * are opposite facts and they looked identical on the screen.
   *
   * IT STILL DOES NOT NAME A GATE, and that has not changed: reporting all
   * four as unestablished because the run threw would be inventing findings.
   * It reports the run.
   */
  if (cash.engine_failed) {
    const t = taskFor('cash_gate.__engine_did_not_run');
    if (!t.settled) {
      out.push({
        fact_id: 'cash_gate.__engine_did_not_run',
        origin: 'cash gate',
        question: 'Our estimate could not run for this client, so the cash-timing checks were not done.',
        why: askedWhy(t, 'this does not mean the checks passed or failed. Nothing ran them. ' +
          'A developer needs to fix this — do not ask the client'),
        blocks: 'BOTH',
        blocks_by_default: true,
        has_task: t.has_task, task_state: t.task_state,
        section: 'facts', from: 'our estimate',
      });
    }
  }

  for (const g of cash.gates) {
    const t = taskFor(`cash_gate.${g}`);
    if (t.settled) continue;
    const known = Object.prototype.hasOwnProperty.call(BLOCKS_BY_CASH_GATE, g);
    out.push({
      fact_id: `cash_gate.${g}`,
      origin: 'cash gate',
      question: CASH_GATE_QUESTION[g] ?? `The cash-timing check “${g}” is not known yet.`,
      why: askedWhy(t, 'our estimate could not settle this check, so it is not known yet. ' +
        'Not known is not the same as a fail — do not read it as a pass or a fail'),
      blocks: known ? (BLOCKS_BY_CASH_GATE[g] as Blocks) : 'BOTH',
      blocks_by_default: !known,
      has_task: t.has_task, task_state: t.task_state,
      section: 'facts', from: 'the client',
    });
  }

  return out;
}

/**
 * The register data we hold, in the shape CB_REGISTRY.derive expects.
 *
 * `register_records` is keyed by the SOURCE REGISTER's ids (CQC, EPC,
 * CH_COMPANY…) and CB_REGISTRY uses its own (cqc, epc, companies_house…).
 * They are two vocabularies for overlapping sets and this is the one place they
 * meet — the same pattern as roles.ts, and for the same reason: one tested
 * mapping beats a cast at every call site.
 *
 * PHASE 146c: THE FIELD NAMES ARE TWO VOCABULARIES TOO, and until this phase
 * they were merged as they stood — so a stored `epc_total_floor_area_m2` never
 * reached derive()'s `floor_area_m2`, and only `incorporation_date`, the one name
 * the two share, would have. Each field now goes through DERIVE_FIELD_OF
 * (src/connectors/free-registers.ts), which maps only a field both sides permit;
 * a field it does not list reaches derive() under no name at all. derive() is
 * still switched off (CB_REGISTRY.precondition), so what the screen shows today
 * does not change.
 *
 * IT IS FILLED ONLY BY WHAT A CONNECTOR READ AND THE ONE DOOR ACCEPTED, or by the
 * seed's invented records. `derive` handles an empty bundle by asking for
 * everything, which is the honest answer and not a special case.
 */
export function registerBundle(db: Db, business_id: string): Record<string, Record<string, unknown>> {
  const bundle: Record<string, Record<string, unknown>> = {};
  for (const r of db.all<{ source_id: string; fields_json: string }>(
    'SELECT source_id, fields_json FROM register_records WHERE business_id = ? ORDER BY obtained_at ASC, id ASC', [business_id],
  )) {
    const key = REGISTRY_ID_OF[r.source_id];
    const names = DERIVE_FIELD_OF[r.source_id];
    if (key === undefined || names === undefined) continue; // a source the derivation layer does not read
    let fields: Record<string, unknown>;
    try { fields = JSON.parse(r.fields_json) as Record<string, unknown>; }
    catch { continue; }
    const mapped: Record<string, unknown> = {};
    for (const [from, to] of Object.entries(names)) {
      if (Object.prototype.hasOwnProperty.call(fields, from)) mapped[to] = fields[from];
    }
    bundle[key] = { ...(bundle[key] ?? {}), ...mapped };
  }
  return bundle;
}

/**
 * The cash gates the engine could not establish, and whether it ran at all.
 *
 * RUN AGAINST THE SESSION THE FUNNEL ACTUALLY WROTE. `sessionFromFunnel` reads
 * `assessment_drafts.state_json` — the CB_FUNNEL state the six screens saved —
 * and maps every answer it can defend from the engine's own code onto a
 * Session. The mapping, and the longer list of what it deliberately leaves
 * absent, are in src/web/funnel-session.ts and are not restated here.
 *
 * EVERY "I DON'T KNOW" AND EVERY SKIPPED ANSWER STILL SETS NOTHING. That is
 * enforced once, in `known()` in that file, which is why nothing in this
 * function tests for it. It is what makes a `null` gate a true report rather
 * than an artefact of how the session was assembled.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT REBUILDING THE SESSION DID AND DID NOT CHANGE — measured, not assumed
 *
 * IT DID NOT EMPTY THIS LIST, AND THAT IS THE FINDING. The old three-question
 * session was expected to OVER-report, on the reasoning that a gate the
 * client's property answers would have established was coming back null for
 * want of those answers. Running both sessions through all five sector engines
 * shows the four gates identical: NO CASH GATE READS A PROPERTY ANSWER.
 * CB_CASH reads exactly five facts — `sufficient_profit`, `aia_headroom`,
 * `pool_split_basis`, `prior_claim_self` and `aia_used_elsewhere` — and of
 * those the six screens collect only the first. Gates 2 and 3 come back null
 * from every funnel-derived session because the funnel genuinely never asks
 * about AIA headroom or the measured pool split; they are missing facts and
 * the panel is right to say so.
 *
 * SO WHY REBUILD IT. Because the old version was right by coincidence and this
 * one is right by construction — the day a gate starts reading the trigger or
 * the entity, this session already carries them. And because the old version
 * had a real defect the widening removed: it read `assessment_answers`, whose
 * `question_id` is not one vocabulary, and mapped the seed's Q1 ("how is the
 * business set up" → "company") onto the funnel's `own_prior_claim`.
 */
function unestablishedGates(
  db: Db, a: AssessmentRow | undefined,
): { gates: string[]; engine_failed: boolean } {
  if (a === undefined) return { gates: [], engine_failed: false };
  const sector = a.sector as SectorId;
  const { session } = sessionFromFunnel(sector, funnelStateFor(db, a.id));

  let gates: Record<string, unknown>;
  try {
    gates = estimate(sector, session).cashGates as unknown as Record<string, unknown>;
  } catch {
    // NOT A MISSING-FACT REPORT, AND NO LONGER A SILENCE EITHER. Naming every
    // gate here would invent findings; returning nothing said the gates were
    // fine. The caller reports the failed run as its own line.
    return { gates: [], engine_failed: true };
  }
  return { gates: Object.keys(gates).filter((k) => gates[k] === null), engine_failed: false };
}

/* ================================================================== *
 * PANEL 4 — TASKS, AND THE TWO ROUTES
 * ================================================================== */

export type TaskView = {
  readonly id: string;
  readonly fact_id: string | null;
  readonly question: string;
  readonly why: string;
  readonly holds_up: string;
  readonly state: string;
  readonly answer_state: string | null;
  readonly answer: string | null;
  readonly answered_at: string | null;
  readonly answered_by_role: string | null;
  readonly answered_by_name: string | null;
  readonly sent_to_portal_at: string | null;
  readonly asked_by_name: string | null;
  readonly created_at: string;
  /** Set together, or not at all — migration 008 has a trigger that says so. */
  readonly withdrawn_at: string | null;
  readonly withdrawn_by_name: string | null;
  /** CRM 3 of 10. The day the question is due, where one was set. None is not overdue and not on time. */
  readonly due_on: string | null;
  /**
   * THE PROVENANCE SENTENCE. One line saying which route cleared this and who
   * entered it — because "a fact the client typed and a fact a staff member
   * typed on their behalf are different provenance", and a claim file that
   * cannot tell them apart cannot be defended.
   */
  readonly provenance: string;
};

const TASK_SELECT =
  'SELECT t.id, t.fact_id, t.question, t.why, t.holds_up, t.state, t.answer_state, t.answer, ' +
  't.answered_at, t.answered_by_role, t.sent_to_portal_at, t.created_at, t.withdrawn_at, t.due_on, ' +
  'ab.display_name AS asked_by_name, an.display_name AS answered_by_name, ' +
  'wb.display_name AS withdrawn_by_name ' +
  'FROM client_tasks t LEFT JOIN users ab ON ab.id = t.asked_by ' +
  'LEFT JOIN users an ON an.id = t.answered_by ' +
  'LEFT JOIN users wb ON wb.id = t.withdrawn_by ';

export function tasksFor(db: Db, actor: Actor, business_id: string): TaskView[] {
  authorise(actor, 'business.read', { type: 'business', id: business_id });
  const rows = db.all<Omit<TaskView, 'provenance'>>(
    // CRM 4 of 10: a document request is answered by an upload, not on this panel.
    TASK_SELECT + "WHERE t.business_id = ? AND t.kind = 'QUESTION' ORDER BY t.created_at ASC", [business_id],
  );
  return rows.map((r) => ({ ...r, provenance: provenanceLine(r) }));
}

/**
 * The four states migration 005 makes distinguishable, in words.
 *
 * READ ALOUD. The next thing a staff member does with this is defend a claim,
 * and "we asked them and they told us" reads differently from "we rang and
 * somebody in the office wrote down what they were told" — which is exactly the
 * distinction the file has to be able to make three years later.
 */
export function provenanceLine(t: {
  state: string; answered_by_role: string | null; answered_by_name: string | null;
  sent_to_portal_at: string | null; answer_state: string | null;
  withdrawn_by_name?: string | null; withdrawn_at?: string | null;
}): string {
  /**
   * WITHDRAWN COMES FIRST, BECAUSE IT IS THE ONE STATE THAT NEEDS EXPLAINING.
   *
   * A question the client saw in their portal and can no longer see is a thing
   * that happened to the claim file, and the sentence says WHO decided it and
   * that the fact is open again — because `missingFacts` puts the fact
   * straight back on the list, and a reader who did not know that would think
   * the withdrawal had closed something.
   */
  if (t.state === 'WITHDRAWN') {
    const by = t.withdrawn_by_name ?? 'a member of staff';
    const seen = t.sent_to_portal_at !== null
      ? 'The client had already been sent it.'
      : 'The client was never sent it.';
    return `Withdrawn by ${by} — asked in error. ${seen} The fact it asked about is outstanding again.`;
  }
  if (t.state !== 'ANSWERED') {
    return t.sent_to_portal_at !== null
      ? 'Sent to the client’s portal. Not answered yet.'
      : 'Drafted here and not yet put to the client.';
  }
  const who = t.answered_by_name ?? 'a member of staff';
  const dk = t.answer_state === 'DONT_KNOW' ? ' They answered “I don’t know”, which is an answer.' : '';
  if (t.answered_by_role === 'CLIENT') {
    return `Answered by the client, in their own portal.${dk}`;
  }
  return t.sent_to_portal_at !== null
    ? `Put to the client in their portal, then answered here by ${who} on the client’s behalf — ` +
      `the client did not type this.${dk}`
    : `Never put to the client. Recorded here by ${who} on the client’s behalf — the client did not ` +
      `type this.${dk}`;
}

export type TaskDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string };

export type TaskResult = { ok: true; task_id: string } | { ok: false; why: string };

/**
 * ROUTE ONE — SEND IT TO THE CLIENT'S PORTAL.
 *
 * Phase 104 built the receiving half: `client_tasks` rows appear in the portal
 * with what is asked, WHY, and WHAT IT HOLDS UP, and the client answers them
 * there. This writes the row and stamps `sent_to_portal_at`, which is what
 * makes the question visible to them and what makes the list say the claim is
 * waiting on the client rather than on us.
 *
 * `why` AND `holds_up` ARE REQUIRED BY THE SCHEMA AND ARE NOT DECORATION.
 * Migration 003: "A task with no stated consequence is a chore; a task that
 * says what it unblocks gets answered."
 */
export function sendTaskToPortal(
  d: TaskDeps, actor: Actor, business_id: string,
  args: { fact_id: string | null; question: string; why: string; holds_up: string; due_on?: string | null; claim_id?: string | null },
): TaskResult {
  authorise(actor, 'business.read', { type: 'business', id: business_id });
  authorise(actor, 'internal_note.write', { type: 'internal_note', id: business_id, business_id });

  // PHASE 134: a question belongs to the company, and may say which of its claims it is about — only one of its own.
  const claim_id = args.claim_id ?? null;
  if (claim_id !== null && d.db.get<{ id: string }>('SELECT id FROM claims WHERE id = ? AND business_id = ?', [claim_id, business_id]) === undefined) {
    return { ok: false, why: 'that claim is not this company’s.' };
  }

  const question = args.question.trim();
  if (question.length === 0) return { ok: false, why: 'write the question you want to ask.' };
  const why = args.why.trim();
  const holds = args.holds_up.trim();
  if (why.length === 0 || holds.length === 0) {
    return { ok: false, why: 'a question sent to a client has to say why it is being asked and what it holds up.' };
  }

  // CRM 3 of 10: a question may be due. None is a choice, and it is not overdue (N4).
  const due = (args.due_on ?? '').trim();
  if (due !== '' && (!/^\d{4}-\d{2}-\d{2}$/.test(due) || !Number.isFinite(Date.parse(`${due}T12:00:00.000Z`)))) {
    return { ok: false, why: 'the due date must be a date like 2026-03-31.' };
  }

  const id = d.newId();
  const at = d.now();
  d.db.run(
    'INSERT INTO client_tasks (id, business_id, asked_by, question, why, holds_up, state, ' +
      'created_at, fact_id, sent_to_portal_at, due_on, claim_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, business_id, actor.id, question, why, holds, 'OPEN', at, args.fact_id, at, due === '' ? null : due, claim_id],
  );
  d.audit.append({
    at, kind: 'USER_UPDATED', outcome: 'ALLOWED',
    actor_id: actor.id, actor_role: actor.role,
    object_type: 'client_task', object_id: id,
    detail: { route: 'PORTAL', business_id, fact_id: args.fact_id ?? '(none)' },
  });
  return { ok: true, task_id: id };
}

/**
 * ROUTE TWO — ANSWER IT HERE, BECAUSE THEY RANG THE CLIENT AND WERE TOLD.
 *
 * BOTH ROUTES WRITE THE SAME FIELD. `client_tasks.answer` and `answer_state`
 * are the same columns `answerTask` in portal.ts writes when the client answers
 * in their own portal — there is no second table, no staff-only shadow copy,
 * and nothing downstream has to know which route was used in order to read the
 * answer.
 *
 * WHAT DIFFERS IS THE RECORD OF WHO ENTERED IT. `answered_by_role` is 'STAFF'
 * here and 'CLIENT' there, and `answered_by` names the person. That is the
 * whole point: the answer is the same fact, and how we came to hold it is not.
 *
 * "I DON'T KNOW" IS AN ANSWER ON THIS ROUTE TOO. A client who says on the
 * telephone that they do not know has told us something, and it is stored as
 * DONT_KNOW with a null value rather than as an empty string that reads as
 * unanswered three months later. N4, again.
 *
 * IT WORKS ON A TASK THAT WAS NEVER SENT. A staff member who already has the
 * answer should not have to send the client a question in order to record it —
 * the row is created and answered in one transaction, `sent_to_portal_at` stays
 * null, and the provenance line says the client was never asked.
 */
export function answerTaskHere(
  d: TaskDeps, actor: Actor, business_id: string,
  args: {
    task_id?: string;
    fact_id?: string | null; question?: string; why?: string; holds_up?: string;
    dont_know: boolean; answer: string;
  },
): TaskResult {
  authorise(actor, 'business.read', { type: 'business', id: business_id });
  authorise(actor, 'internal_note.write', { type: 'internal_note', id: business_id, business_id });

  const text = args.answer.trim();
  if (!args.dont_know && text.length === 0) {
    return { ok: false, why: 'write what the client told you, or tick “they said they do not know”.' };
  }
  const at = d.now();

  let taskId: string;
  if (args.task_id !== undefined && args.task_id !== '') {
    const row = d.db.get<{ id: string; business_id: string; state: string; kind: string }>(
      'SELECT id, business_id, state, kind FROM client_tasks WHERE id = ?', [args.task_id],
    );
    // A row belonging to another business is not found, and is not named.
    if (row === undefined || row.business_id !== business_id) return { ok: false, why: 'not found' };
    // CRM 4 of 10: RECEIVED IS NOT A CLICK, and a member of staff typing "they sent it" is a click.
    if (row.kind === 'DOCUMENT') return { ok: false, why: RECEIVED_ONLY_BY_UPLOAD };
    if (row.state !== 'OPEN') return { ok: false, why: 'that question is already closed.' };
    taskId = row.id;
  } else {
    const question = (args.question ?? '').trim();
    if (question.length === 0) return { ok: false, why: 'name the fact you are recording an answer for.' };
    taskId = d.newId();
    d.db.run(
      'INSERT INTO client_tasks (id, business_id, asked_by, question, why, holds_up, state, ' +
        'created_at, fact_id, sent_to_portal_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)',
      [taskId, business_id, actor.id, question,
       (args.why ?? '').trim() || 'Recorded from a conversation with the client.',
       (args.holds_up ?? '').trim() || 'Not stated.',
       'OPEN', at, args.fact_id ?? null],
    );
  }

  d.db.run(
    'UPDATE client_tasks SET state = ?, answer_state = ?, answer = ?, answered_at = ?, ' +
      'answered_by = ?, answered_by_role = ? WHERE id = ?',
    ['ANSWERED', args.dont_know ? 'DONT_KNOW' : 'ANSWERED', args.dont_know ? null : text,
     at, actor.id, 'STAFF', taskId],
  );

  d.audit.append({
    at, kind: 'USER_UPDATED', outcome: 'ALLOWED',
    actor_id: actor.id, actor_role: actor.role,
    object_type: 'client_task', object_id: taskId,
    detail: { route: 'STAFF', business_id, dont_know: args.dont_know },
  });
  return { ok: true, task_id: taskId };
}

/**
 * ROUTE THREE — TAKE THE QUESTION BACK, BECAUSE IT SHOULD NOT HAVE BEEN ASKED.
 *
 * `client_tasks.state` has allowed WITHDRAWN since migration 003 and
 * `missingFacts` has always read it correctly — a withdrawn question is not a
 * task, so the fact goes back on the missing list. Nothing set it. This is the
 * control, and it is the third route on panel 4 rather than a fourth screen,
 * for the same reason the other two sit together: the decision is made about
 * ONE question at the moment a staff member is looking at it.
 *
 * IT WITHDRAWS AN OPEN QUESTION AND NOTHING ELSE.
 *
 *   ANSWERED   REFUSED. The answer is a fact the client gave us, on a route
 *              the file records. Withdrawing the question would delete it, and
 *              a claim file that can lose an answer by a click on the question
 *              is not a claim file. Somebody who asked the wrong question and
 *              got an answer to it has a different problem, and the answer
 *              stays visible while they work out what it is.
 *   WITHDRAWN  REFUSED, and the message says it has already happened rather
 *              than pretending to do it again — a second withdrawal would
 *              overwrite the first one's name and timestamp with today's.
 *
 * AND THE REFUSAL IS AGAINST THE RECORD, NOT AGAINST THE SCREEN. Panel 4 shows
 * the control only on an open question, which is presentation; this function
 * reads the row and refuses, which is the control. A POST to this route for an
 * answered question is refused whether or not a button was ever drawn for it,
 * and there is a test that posts one.
 *
 * THE UPDATE CARRIES THE SAME GUARD A SECOND TIME. `WHERE id = ? AND state =
 * 'OPEN'` means two operators clicking at once cannot both succeed: the second
 * changes no rows and is told so, rather than restamping the first one's
 * withdrawal. The read above is for the sentence; the WHERE is the control.
 */
export function withdrawTask(
  d: TaskDeps, actor: Actor, business_id: string, task_id: string,
): TaskResult {
  authorise(actor, 'business.read', { type: 'business', id: business_id });
  authorise(actor, 'internal_note.write', { type: 'internal_note', id: business_id, business_id });

  const id = task_id.trim();
  if (id === '') return { ok: false, why: 'name the question you are withdrawing.' };

  const row = d.db.get<{ id: string; business_id: string; state: string; fact_id: string | null; kind: string }>(
    'SELECT id, business_id, state, fact_id, kind FROM client_tasks WHERE id = ?', [id],
  );
  // A row belonging to another business is not found, and is not named.
  if (row === undefined || row.business_id !== business_id) return { ok: false, why: 'not found' };
  if (row.kind === 'DOCUMENT') {
    return { ok: false, why: 'that is a document request: withdraw it from the claim’s documents panel, which records it as a withdrawn request.' };
  }
  if (row.state === 'WITHDRAWN') {
    return { ok: false, why: 'that question has already been withdrawn.' };
  }
  if (row.state !== 'OPEN') {
    return {
      ok: false,
      why: 'that question has been answered. Taking it back would delete what the client told us. ' +
        'So the answer stays. Write a Team only note to say it was asked by mistake.',
    };
  }

  const at = d.now();
  const changed = d.db.run(
    "UPDATE client_tasks SET state = 'WITHDRAWN', withdrawn_at = ?, withdrawn_by = ? " +
      "WHERE id = ? AND state = 'OPEN'",
    [at, actor.id, row.id],
  ).changes;
  if (changed !== 1) return { ok: false, why: 'that question changed while you were looking at it. Open the client again.' };

  d.audit.append({
    at, kind: 'USER_UPDATED', outcome: 'ALLOWED',
    actor_id: actor.id, actor_role: actor.role,
    object_type: 'client_task', object_id: row.id,
    detail: { route: 'WITHDRAWN', business_id, fact_id: row.fact_id ?? '(none)' },
  });
  return { ok: true, task_id: row.id };
}

/* ================================================================== *
 * PANEL 5 — INTERNAL NOTES
 * ================================================================== */

export type NoteView = {
  readonly id: string;
  readonly body: string;
  readonly author_name: string | null;
  readonly created_at: string;
};

/**
 * INTERNAL ONLY — AND IT IS `can()` THAT MAKES IT SO, NOT THIS FILE.
 *
 * `internal_note.read` lists ADMIN and SALES. CLIENT and SURVEYING are absent
 * from that row, so a client or a surveyor asking for a note is refused by the
 * rule table rather than by nobody having drawn them a screen. There is nothing
 * in portal.ts that reads this table, nothing in payload.ts that puts a note in
 * a surveyor payload — `JobInputs` has no field for one — and there are tests
 * that assert both, because "we did not build the screen" is not a control.
 *
 * ESCAPE ON OUTPUT. These are staff-supplied strings rendered in a staff page,
 * which is exactly where stored cross-site scripting lives. The renderer builds
 * every note through the `h` tagged template, which escapes anything that is
 * not already Safe, and there is a test that posts a script tag and asserts it
 * comes back escaped.
 */
export function notesFor(db: Db, actor: Actor, business_id: string): NoteView[] {
  authorise(actor, 'internal_note.read', { type: 'internal_note', id: business_id, business_id });
  return db.all<NoteView>(
    'SELECT n.id, n.body, n.created_at, u.display_name AS author_name ' +
      'FROM internal_notes n LEFT JOIN users u ON u.id = n.author_id ' +
      'WHERE n.business_id = ? ORDER BY n.created_at DESC',
    [business_id],
  );
}

/**
 * ONE NOTES STORE. CRM 3 of 10 lets a note say which claim or property it is
 * about (disposition rows 6.21 and 8.27) — still the organisation's note, and
 * the database refuses a claim or a property of another organisation. A note is
 * audited now, as every write is: the line names the note and never its words.
 */
export function addNote(
  d: TaskDeps, actor: Actor, business_id: string, body: string,
  link: { readonly claim_id?: string | null; readonly property_id?: string | null } = {},
): { ok: true; id: string } | { ok: false; why: string } {
  authorise(actor, 'internal_note.write', { type: 'internal_note', id: business_id, business_id });
  const text = body.trim();
  if (text.length === 0) return { ok: false, why: 'write something before saving a note.' };
  if (text.length > 8000) return { ok: false, why: 'that note is longer than we store — 8,000 characters is the limit.' };
  const claim_id = link.claim_id ?? null;
  const property_id = link.property_id ?? null;
  if (claim_id !== null && d.db.get<{ id: string }>('SELECT id FROM claims WHERE id = ? AND business_id = ?', [claim_id, business_id]) === undefined) {
    return { ok: false, why: 'that claim is not this organisation’s.' };
  }
  if (property_id !== null && d.db.get<{ id: string }>('SELECT id FROM properties WHERE id = ? AND business_id = ?', [property_id, business_id]) === undefined) {
    return { ok: false, why: 'that property is not this organisation’s.' };
  }
  const id = d.newId();
  d.db.run(
    'INSERT INTO internal_notes (id, business_id, author_id, body, created_at, claim_id, property_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, business_id, actor.id, text, d.now(), claim_id, property_id],
  );
  d.audit.append({
    at: d.now(), kind: 'INTERNAL_NOTE_ADDED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'internal_note', object_id: id, detail: { business: business_id, claim: claim_id, property: property_id },
  });
  return { ok: true, id };
}

/* ================================================================== *
 * THE WHOLE PAGE
 * ================================================================== */

export type BusinessPage = {
  readonly business: { id: string; name: string; sector: string; stage: string; stage_label: string };
  readonly row: ClientRow;
  readonly qa: ReturnType<typeof questionsAndAnswers>;
  readonly missing: readonly MissingFact[];
  readonly tasks: readonly TaskView[];
  readonly notes: readonly NoteView[];
  /** False for a role that may not read notes; the panel then says so honestly. */
  readonly may_read_notes: boolean;
  readonly may_write: boolean;
};

export function businessPage(db: Db, actor: Actor, business_id: string): BusinessPage {
  assertClientsSection(actor);
  const b = db.get<{ id: string; name: string; sector: string; stage: string; created_at: string }>(
    'SELECT id, name, sector, stage, created_at FROM businesses WHERE id = ?', [business_id],
  );
  // A missing row and a forbidden row look the same from outside.
  if (b === undefined) throw new NotFoundAsRefusal();
  authorise(actor, 'business.read', { type: 'business', id: b.id });

  const noteObj = { type: 'internal_note' as const, id: b.id, business_id: b.id };
  const mayReadNotes = can(actor, 'internal_note.read', noteObj);
  const mayWrite = can(actor, 'internal_note.write', noteObj);

  const submitted = db.get<{ at: string | null }>(
    'SELECT MAX(submitted_at) AS at FROM assessments WHERE business_id = ?', [b.id],
  );

  return {
    business: {
      id: b.id, name: b.name, sector: b.sector, stage: b.stage,
      stage_label: stageOf(b.stage)?.label ?? 'stage unknown — open the claim to check',
    },
    row: clientRow(db, actor, {
      business_id: b.id, name: b.name, sector: b.sector, stage: b.stage,
      submitted_at: submitted?.at ?? null,
    }),
    qa: questionsAndAnswers(db, actor, b.id),
    missing: missingFacts(db, actor, b.id),
    tasks: tasksFor(db, actor, b.id),
    // BUILT FORWARDS. An empty list is what a role that may not read notes gets,
    // and the page says why rather than drawing an empty panel.
    //
    // NO ROLE REACHES THIS BRANCH THROUGH `/staff/clients` TODAY, because the
    // section gate above is the same ADMIN-and-SALES rule that reads a note.
    // It is kept because this is a VIEW MODEL and the section gate is a ROUTE
    // decision: Phase 107 mounts client data behind a different gate, and a
    // model that read notes unconditionally would leak them the moment it was
    // called from there. `can()` is the control; the branch is what makes the
    // model safe to reuse.
    notes: mayReadNotes ? notesFor(db, actor, b.id) : [],
    may_read_notes: mayReadNotes,
    may_write: mayWrite,
  };
}

/**
 * PHASE 138 — WHICH OF A CLAIM'S FACTS ARE ALREADY WITH THE CLIENT. The claim page's WE NEED lines ask the client through
 * the same route as the company page (`sendTaskToPortal`), naming the claim and a fact id `claim_fact.<key>`. This reads
 * the open questions back, so a fact already asked says "Asked — waiting" instead of offering a second ask. Asked of the
 * same two rules the ask itself asks; a login refused either reads nothing.
 */
export function openClaimQuestions(db: Db, actor: Actor, business_id: string, claim_id: string): ReadonlySet<string> {
  if (!can(actor, 'business.read', { type: 'business', id: business_id })
    || !can(actor, 'internal_note.write', { type: 'internal_note', id: business_id, business_id })) return new Set();
  return new Set(db.all<{ fact_id: string }>(
    "SELECT fact_id FROM client_tasks WHERE business_id = ? AND claim_id = ? AND state = 'OPEN' AND fact_id IS NOT NULL",
    [business_id, claim_id],
  ).map((r) => r.fact_id));
}
