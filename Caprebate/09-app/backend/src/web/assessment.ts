/**
 * THE ASSESSMENT — CB_FUNNEL's six screens, ported.
 *
 * THE CLIENT-FACING COPY, THE QUESTION WORDING AND THE ORDER ARE NOT THIS
 * PHASE'S TO CHANGE. They are the product of five sector specifications and a
 * CTA review, and every string in SCREENS below is transcribed from the site's
 * own renderer (`FN.screenQ1` … `FN.screenQ3` in "Caprebate site.html"), not
 * rewritten. Where the site writes an HTML entity — `&mdash;`, `’` — the
 * character it stands for is used, because this file escapes on output. That
 * is the only difference, and it renders identically.
 *
 * PHASE 144a, 22 September 2026 — PLAIN WORDS, CHANGED IN BOTH PLACES AT ONCE.
 * Three help lines (Q1, Q1a and the cosmetic-work note) were split into shorter
 * sentences, the same words in this file and in the site's renderer; nothing
 * they say changed. Q1's question itself is NOT changed: its wording could
 * change what a client answers, so a plainer version is with the tax adviser
 * in FOR THE ACCOUNTANT first. The plain-words check now reads this file.
 *
 * WHAT IS DIFFERENT, AND WHY IT HAD TO BE
 *
 * The site keeps the funnel state in a JavaScript variable and redraws with
 * inline `onclick` handlers. The security baseline forbids inline script — the
 * CSP has no `unsafe-inline` — so the same six screens are server-rendered
 * forms and the state lives in `assessment_drafts`, keyed by an httpOnly
 * cookie. SAME SCREENS, SAME COPY, SAME ORDER, SAME GATES. The client can also
 * now complete the whole funnel with JavaScript disabled, which the original
 * could not.
 *
 * EVERY RULE STILL COMES FROM THE ENGINE PACKAGE. The gates are
 * CB_FRONTDOOR's, the bands are CB_BAND's, the figure and the assumptions are
 * CB_FUNNEL's, the channels and consents are CB_BOOKING's. Nothing in this
 * file decides a tax question, and `grep` for a rate or a band here returns
 * nothing.
 */

import { normalisePostcode } from '../connectors/postcode-check.ts';
import { randomUUID } from 'node:crypto';
import type { Db } from '../db.ts';
import { FUNNEL, FRONTDOOR } from './engine.ts';
import { openLeadForGatedExit, openLeadForSubmission } from './leads.ts';

export const SCREEN_IDS = ['Q1', 'Q1a', 'Q1b', 'Q1c', 'Q2', 'Q3'] as const;
export type ScreenId = (typeof SCREEN_IDS)[number];

/**
 * The screens' own words. VERBATIM from the site renderer.
 *
 * A NOTE ON `group`. The site draws a small kicker above each heading — "About
 * any earlier claim", "Your tax position". They are part of the copy and they
 * are carried across rather than dropped as decoration; a client reading six
 * screens uses them to know where they are.
 */
export const SCREENS: Readonly<Record<ScreenId, {
  group: string; heading: string; help?: string;
}>> = Object.freeze({
  Q1: {
    group: 'About any earlier claim',
    heading: 'Have you already made a capital allowances claim on the fixtures in this building — the plant, wiring, heating and similar?',
    help: 'We mean the fixed things in the fabric of the building. Not equipment you bought and could take with you. Not ordinary repairs either. Those are different claims, and having made them doesn’t affect this one.',
  },
  Q1a: {
    group: 'About any earlier claim',
    heading: 'Do you know whether a previous owner ever claimed on them?',
    help: 'Most people don’t, and that’s fine — it doesn’t stop a claim. Often it’s the opposite. For purchases since April 2014, a seller who claimed is usually what makes your own claim possible.',
  },
  Q1b: {
    group: 'Your tax position',
    heading: 'Does the business pay UK income tax or corporation tax?',
    help: 'Capital allowances reduce a tax bill — there has to be one to claim against.',
  },
  Q1c: {
    group: 'What prompted this',
    heading: 'What brought you here?',
    help: 'This decides which set of tax rules applies to your claim.',
  },
  Q2: {
    group: 'The property',
    heading: 'Tell us about the property.',
    help: 'You can add as many as you like. Each one is its own claim and its own set of checks — and one engagement covers all of them.',
  },
  Q3: {
    group: 'Works',
    heading: 'Any other work done to these properties?',
  },
});

/** The option labels, also verbatim. `value` is what CB_FUNNEL's state stores. */
export const OPTIONS = Object.freeze({
  own_prior_claim: [
    { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'not sure', label: 'Not sure' },
  ],
  previous_owner_claimed: [
    { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'dont_know', label: 'Don’t know' },
  ],
  is_uk_taxpayer: [
    { value: 'yes', label: 'Yes — a UK taxpaying business' },
    { value: 'no', label: 'No, or we’re a charity' },
    { value: 'not sure', label: 'Not sure' },
  ],
  /** The follow-up, asked only where CB_FRONTDOOR.gateQ1b says to. */
  current_year_position: [
    { value: 'profitable', label: 'Profitable' }, { value: 'loss', label: 'Loss-making' },
    { value: 'breakeven', label: 'Roughly break-even' }, { value: 'unsure', label: 'Not sure' },
  ],
  works: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
  works_type: [
    { value: 'full', label: 'Full renovation' }, { value: 'cosmetic', label: 'Cosmetic' },
    { value: 'extension', label: 'Extension or expansion' }, { value: 'other', label: 'Other' },
  ],
});

/**
 * The one piece of copy the site attaches to an answer rather than a question.
 * It fires on `works_type === "cosmetic"` and it is worth keeping precisely
 * because it tells the client something AGAINST our own interest.
 */
export const COSMETIC_NOTE =
  'Worth knowing: cosmetic work usually counts as a repair. A repair is not a capital improvement. ' +
  'That is often better for you — it comes off your tax bill straight away — but it is a ' +
  'different claim from this one.';

export type FunnelState = ReturnType<typeof FUNNEL.blankState>;

/* ------------------------------------------------------------------ *
 * THE DRAFT — server-side, always.
 * ------------------------------------------------------------------ */

export type Draft = { token: string; state: FunnelState; screen: ScreenId };

export function newDraft(db: Db, now: () => string, id: () => string = randomUUID): Draft {
  const token = id();
  const state = FUNNEL.blankState() as FunnelState;
  db.run(
    'INSERT INTO assessment_drafts (token, state_json, screen, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [token, JSON.stringify(state), 'Q1', now(), now()],
  );
  return { token, state, screen: 'Q1' };
}

export function loadDraft(db: Db, token: string | undefined): Draft | undefined {
  if (token === undefined) return undefined;
  const row = db.get<{ state_json: string; screen: string; submitted_assessment_id: string | null; closed_lead_id: string | null }>(
    'SELECT state_json, screen, submitted_assessment_id, closed_lead_id FROM assessment_drafts WHERE token = ?', [token],
  );
  if (row === undefined) return undefined;
  // A submitted draft is finished. Replaying its token must not re-submit it —
  // and a draft closed at the reasoned negative is finished in the same way, on
  // the lead it became rather than on an assessment it never produced.
  if (row.submitted_assessment_id !== null || row.closed_lead_id !== null) return undefined;
  return {
    token,
    state: JSON.parse(row.state_json) as FunnelState,
    screen: (SCREEN_IDS as readonly string[]).includes(row.screen) ? (row.screen as ScreenId) : 'Q1',
  };
}

export function saveDraft(db: Db, d: Draft, now: () => string): void {
  db.run('UPDATE assessment_drafts SET state_json = ?, screen = ?, updated_at = ? WHERE token = ?',
    [JSON.stringify(d.state), d.screen, now(), d.token]);
}

/* ------------------------------------------------------------------ *
 * NAVIGATION — and the gate is the engine's, not ours.
 * ------------------------------------------------------------------ */

/**
 * The next screen, or the terminal outcome.
 *
 * Q1b IS A GATE, AND THE ONLY ONE LEFT IN THE FRONT DOOR. `CB_FRONTDOOR.gateQ1b`
 * decides whether the client continues or reaches a reasoned negative — a STOP
 * for a business with no UK tax bill, or a charity. THIS FILE DOES NOT DECIDE
 * THAT AND MUST NOT: a reasoned no is a valid, honest outcome and the rule for it
 * lives in one place. A gated exit is also the highest-value place to offer a
 * call, and CB_BOOKING.offerAt('gated_exit') says so in terms.
 *
 * THE GATE NEVER FIRED UNTIL 11 SEPTEMBER 2026. This read a field called `stop`,
 * which the engine has never returned, and the declaration beside the generated
 * package named `stop` too, so the compiler agreed. The engine's field is
 * `gated`; the declaration now names every field `gateQ1b` returns; and
 * test/gated-exit.test.ts holds the reproduction that was red before this changed.
 */
export function nextScreen(state: FunnelState, from: ScreenId): ScreenId | 'figure' | 'gated_exit' {
  if (from === 'Q1b' && isGatedExit(state)) return 'gated_exit';
  const i = SCREEN_IDS.indexOf(from);
  const next = SCREEN_IDS[i + 1];
  return next ?? 'figure';
}

/**
 * Whether the engine stops this draft at the reasoned negative.
 *
 * ONLY `gated`. "Not sure" and never-asked both read `gated: false` — the
 * engine's reversal of 3 September 2026: an unknown tax position continues, and
 * the figure carries the condition on its face (N4). Nothing here widens that.
 */
export function isGatedExit(state: FunnelState): boolean {
  return FRONTDOOR.gateQ1b(state).gated === true;
}

/**
 * The screens past the gate. A draft the gate has stopped reaches none of them,
 * and no figure. Navigation is a courtesy; the router asks `isGatedExit` again on
 * every request, so a client who types an address does not walk round the gate.
 */
export const PAST_THE_GATE: readonly ScreenId[] = Object.freeze(['Q1c', 'Q2', 'Q3'] as const);

/** Whether Q1b's profit follow-up renders. CB_FRONTDOOR decides; we ask. */
export function asksProfit(state: FunnelState): boolean {
  return FRONTDOOR.gateQ1b(state).askProfit === true;
}

/* ------------------------------------------------------------------ *
 * SUBMISSION — the whole system's opening move.
 * ------------------------------------------------------------------ */

export type Submission = {
  business_id: string; assessment_id: string;
  low_pence: number | null; high_pence: number | null;
  /**
   * The lead this submission is. CRM 2 of 10: the claim is NOT opened here — it
   * opens when the lead converts, after the enquiry gate (disposition row E3).
   */
  lead_id: string;
};

/**
 * THE CLOSE AT A REASONED NEGATIVE — the gated-exit repair, 11 September 2026.
 *
 * `submit()` cannot run here and must not. It takes the sector from the first
 * property, and a prospect stopped at Q1b has none; it would create an
 * organisation and an assessment for a funnel that produced no figure. Until
 * this existed the close answered 500 and lost the one lead a reasoned negative
 * exists to keep.
 *
 * So this records a LEAD — origin GATED_EXIT, from the website, NO organisation,
 * carrying the business name as the prospect gave it — and hands its id to
 * `withLead` INSIDE THE SAME TRANSACTION, which writes the person and the channel
 * onto a contact and a booking that belong to the lead (migration 011,
 * disposition row E22). The draft is closed on the lead, so a replayed token
 * writes nothing. Nothing about the tax position is copied anywhere: the lead's
 * origin says the gate fired, and the gate is the engine's.
 */
export function closeGatedExit<T>(
  db: Db, d: Draft, now: () => string, id: () => string, withLead: (lead_id: string) => T,
): { lead_id: string; written: T } {
  if (!isGatedExit(d.state)) throw new Error('only a draft the gate has stopped closes at the reasoned negative');
  const at = now();
  return db.tx(() => {
    const lead_id = openLeadForGatedExit(db, id, { prospect_organisation: businessName(d.state), at });
    const written = withLead(lead_id);
    db.run('UPDATE assessment_drafts SET closed_lead_id = ?, updated_at = ? WHERE token = ?', [lead_id, at, d.token]);
    return { lead_id, written };
  });
}

/**
 * Turn a completed funnel into records the back end can see.
 *
 * WHY THE ANSWERS ARE WRITTEN ONE ROW EACH, AND WHY "I DON'T KNOW" IS A ROW.
 * Migration 002 says it: a skipped question is a row and "I don't know" is a
 * row, because both are facts about the claim rather than blanks. That is
 * non-negotiable N4 reaching the database, and it is why this function walks
 * the state and records a STATE for every question rather than inserting only
 * the ones with values.
 *
 * THE FIGURE IS THE ENGINE'S. `CB_FUNNEL.figure` produces it and the same
 * numbers are stored as the client was shown them — one column, both views,
 * so a staff screen and a client screen cannot drift.
 */
export function submit(
  db: Db, d: Draft, now: () => string, id: () => string = randomUUID,
): Submission {
  const s = d.state;
  // A DRAFT THE GATE HAS STOPPED IS NEVER SUBMITTED: no figure, so no assessment
  // to record and no sector to make an organisation from. It closes as a lead
  // through `closeGatedExit` above. The router asks first; this refuses anyway,
  // so a second caller cannot forget.
  if (isGatedExit(s)) throw new Error('a draft stopped at the reasoned negative closes as a lead, not a submission');
  // The declarations for CB_FUNNEL were widened by this phase, so no cast is
  // needed and the compiler now checks these field names against the module.
  const figure = FUNNEL.figure(s);
  const first = (s.properties ?? [])[0] as { sector?: string | null; address?: string | null } | undefined;
  const sector = first?.sector ?? null;
  if (sector === null) throw new Error('cannot submit a funnel with no sector');

  const business_id = id();
  const assessment_id = id();
  const at = now();

  // The ceiling the client was shown, in integer pence. `total` is a ceiling,
  // so it is the HIGH end; the low end comes from the same breakdown.
  const high = typeof figure.total === 'number' ? Math.round(figure.total * 100) : null;
  const low = lowOf(figure);

  let lead_id = '';
  db.tx(() => {
    // CRM 1 of 10: `source` is DERIVED — a business that arrived through the
    // funnel arrived through the website — and `updated_at` starts at creation.
    // 29 Sep 2026: the company number, when the person chose their company from the first screen's search.
    const cn = (s as unknown as { company_number?: unknown }).company_number;
    const chosenNumber = typeof cn === 'string' && /^(\d{8}|[A-Z]{2}\d{6})$/.test(cn) ? cn : null;
    db.run(
      'INSERT INTO businesses (id, name, sector, stage, contact_email, contact_phone, created_at, source, updated_at, company_number) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [business_id, businessName(s), sector, 'ASSESSMENT_SUBMITTED',
       contactEmail(s), contactPhone(s), at, 'WEBSITE', at, chosenNumber],
    );
    // 29 Sep 2026: the first screen's postcode goes on the first property, when that property's address still carries it.
    const start = (s as unknown as { start?: StartAnswers }).start;
    const startPostcode = start?.postcode !== undefined && start.postcode !== null ? normalisePostcode(start.postcode) : null;
    let firstProperty: string | null = null;
    for (const p of (s.properties ?? []) as { address?: string | null }[]) {
      const property_id = id();
      const first = firstProperty === null;
      firstProperty ??= property_id;
      const pc = first && startPostcode !== null && typeof p.address === 'string'
        && p.address.toUpperCase().replace(/\s+/g, '').includes(startPostcode.replace(' ', '')) ? startPostcode : null;
      db.run('INSERT INTO properties (id, business_id, label, postcode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [property_id, business_id, p.address ?? 'Unnamed property', pc, at, at]);
    }
    db.run(
      'INSERT INTO assessments (id, business_id, sector, submitted_at, shown_low_pence, shown_high_pence, created_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?)',
      [assessment_id, business_id, sector, at, low, high, at],
    );
    /* THE LEAD — CRM 2 of 10. A submission is a lead, NEW, from the website,
       carrying this organisation and this assessment. CRM 1 of 10 opened a claim
       here, and that put every prospect into the procedure's second stage with
       the enquiry gate never asked. The claim now opens when a person has
       recorded the enquiry checks and converts the lead — on the first property,
       carrying this assessment, exactly as it was opened here before. */
    void firstProperty;
    lead_id = openLeadForSubmission(db, id, { business_id, assessment_id, at });
    let ord = 0;
    for (const a of answerRows(s)) {
      db.run(
        'INSERT INTO assessment_answers (id, assessment_id, ord, question_id, question_text, state, value) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id(), assessment_id, ord++, a.question_id, a.question_text, a.state, a.value],
      );
    }
    db.run('UPDATE assessment_drafts SET submitted_assessment_id = ? WHERE token = ?',
      [assessment_id, d.token]);
  });

  return { business_id, assessment_id, low_pence: low, high_pence: high, lead_id };
}

function lowOf(figure: { readonly breakdown?: readonly { low?: number }[] }): number | null {
  const rows = figure.breakdown ?? [];
  let total = 0; let any = false;
  for (const r of rows) {
    if (typeof r.low === 'number') { total += r.low; any = true; }
  }
  return any ? Math.round(total * 100) : null;
}

/** 29 Sep 2026: an address in parts, as the four-stage funnel's stage 3 asks it (building and street, town, postcode). */
export type StartAnswers = { line1: string | null; town: string | null; postcode: string | null };

/** The first property's address, as the first screen writes it: the parts given, in order, with commas. */
export function addressFrom(a: StartAnswers): string | null {
  const parts = [a.line1, a.town, a.postcode].filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim());
  return parts.length === 0 ? null : parts.join(', ');
}

function businessName(s: FunnelState): string {
  const c = s.contact as { business_name?: string | null } | undefined;
  const n = c?.business_name;
  // NOT A GUESS AND NOT A BLANK. A funnel closed without a business name is a
  // lead we still hold, and calling it "Unnamed" is honest where inventing one
  // from the property address would put words in the client's mouth.
  return typeof n === 'string' && n.trim().length > 0 ? n.trim() : 'Unnamed business';
}

function contactEmail(s: FunnelState): string | null {
  const c = s.contact as { channel?: string | null; contact_value?: string | null } | undefined;
  // 30 Sep 2026: a video call is reached by email too.
  return c?.channel === 'email' || c?.channel === 'video' ? (c.contact_value ?? null) : null;
}
function contactPhone(s: FunnelState): string | null {
  const c = s.contact as { channel?: string | null; contact_value?: string | null } | undefined;
  return c?.channel === 'phone' || c?.channel === 'sms_whatsapp' ? (c.contact_value ?? null) : null;
}
/**
 * THE CONTACT CHANNEL IS NO LONGER WRITTEN HERE, AND THAT IS THE FIX.
 *
 * This function used to map CB_BOOKING's channel ids onto
 * `businesses.preferred_contact`, whose vocabulary was email / telephone /
 * virtual / post — and its own comment called that "a FOURTH vocabulary". It
 * was right, and mapping between the two is what kept both alive: 'virtual' is
 * VIDEO, removed on 3 September 2026, and 'post' was never a channel, so the
 * column could hold two things no client can choose. The seed held both.
 *
 * Migration 004 retired the column and migration 007 REMOVED it (Phase 113a),
 * so there is no longer a second place for this fact to be wrong in. The
 * channel is written to the BOOKING row, in CB_BOOKING's own words, by
 * `writeBookingAndContact` in router.ts — one place, one vocabulary — and the
 * back office, the calendar and the client's portal all read that row.
 */

type AnswerRow = { question_id: string; question_text: string; state: string; value: string | null };

/**
 * Every question the funnel asked, with the state it ended in.
 *
 * ANSWERED / DONT_KNOW / SKIPPED are the three the schema allows and they are
 * not interchangeable. A client who ticked "I don't know" on the spend told us
 * something; a client who never reached that screen did not.
 */
export function answerRows(s: FunnelState): AnswerRow[] {
  const rows: AnswerRow[] = [];
  const q = (id: string, text: string, v: unknown, dontKnow = false): void => {
    if (dontKnow) { rows.push({ question_id: id, question_text: text, state: 'DONT_KNOW', value: null }); return; }
    if (v === null || v === undefined || v === '') {
      rows.push({ question_id: id, question_text: text, state: 'SKIPPED', value: null }); return;
    }
    rows.push({ question_id: id, question_text: text, state: 'ANSWERED', value: String(v) });
  };

  q('Q1', SCREENS.Q1.heading, s.own_prior_claim === 'not sure' ? null : s.own_prior_claim,
    s.own_prior_claim === 'not sure');
  q('Q1a', SCREENS.Q1a.heading, s.previous_owner_claimed === 'dont_know' ? null : s.previous_owner_claimed,
    s.previous_owner_claimed === 'dont_know');
  q('Q1b', SCREENS.Q1b.heading, s.is_uk_taxpayer === 'not sure' ? null : s.is_uk_taxpayer,
    s.is_uk_taxpayer === 'not sure');
  if (s.current_year_position !== null && s.current_year_position !== undefined) {
    q('Q1b-profit', 'Is the business currently running at a profit?',
      s.current_year_position === 'unsure' ? null : s.current_year_position,
      s.current_year_position === 'unsure');
  }
  q('Q1c', SCREENS.Q1c.heading, s.trigger_default);

  (s.properties ?? []).forEach((p, i) => {
    const pr = p as Record<string, unknown>;
    const n = i + 1;
    q(`Q2-${n}-address`, `Property ${n}: where is it?`, pr.address);
    q(`Q2-${n}-sector`, `Property ${n}: what kind of business operates here?`, pr.sector);
    q(`Q2-${n}-entity`, `Property ${n}: which kind of legal entity holds it?`, pr.entity_type);
    q(`Q2-${n}-trigger`, `Property ${n}: how did you come by this one?`, pr.trigger);
    q(`Q2-${n}-spend`, `Property ${n}: roughly what was spent?`, pr.spend, pr.spend_unknown === true);
    q(`Q2-${n}-date`, `Property ${n}: roughly when?`, pr.date, pr.date_unknown === true);
    q(`Q3-${n}-works`, `Property ${n}: any other work done?`, pr.works);
    if (pr.works === 'yes') {
      q(`Q3-${n}-works-type`, `Property ${n}: what kind of work?`, pr.works_type);
      q(`Q3-${n}-works-spend`, `Property ${n}: roughly how much?`, pr.works_spend, pr.works_spend_unknown === true);
      q(`Q3-${n}-works-year`, `Property ${n}: roughly when?`, pr.works_year, pr.works_year_unknown === true);
    }
  });
  return rows;
}
