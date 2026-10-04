/**
 * THE STATUTORY CLOCKS OF THE COMPLIANCE REGISTERS — computed, never typed.
 *                                                     CRM 8 of 10
 *
 * Built to the Rights-Request Register, Complaints Log and s.164A pack
 * (08-monday-doc-exports, item 12927908435) exactly as it works them:
 *
 *   ARTICLE 12A, per LIMB (pack 2.4, 2.5)
 *     relevant_time            = the latest of receipt; receipt of Article 12(6)
 *                                identity information, IF IT WAS ASKED FOR; payment
 *                                of an Article 12(5) fee, IF ONE WAS CHARGED
 *     days_not_counted         = the period beginning with the day an Article
 *                                12A(5) clarification was asked for and ending with
 *                                the day it arrived — ARTICLE 15 LIMB ONLY, 0 on
 *                                every other limb, and the reason says so
 *     extension_notice_deadline = one month beginning with relevant_time
 *                                + days_not_counted
 *     applicable_period_end    = the same, or three months if VALIDLY extended
 *
 *   s.164A(3), per COMPLAINT (pack 3.3)
 *     acknowledgement_deadline = 30 calendar days beginning with the day of
 *                                receipt. NOTHING moves it: no identity, no fee,
 *                                no pause, no extension.
 *
 * "BEGINNING WITH" IS INCLUSIVE, AND THE CONSERVATIVE RULE GOVERNS (pack 2.5.3).
 * One month beginning with a day ends the day BEFORE the corresponding date in
 * the following month. Where that month has no corresponding date, it ends on
 * the last day of that shorter month. The pack marks the convention [VERIFY —
 * DPO]; where the alternative reading (ending ON the corresponding date) gives a
 * different day, both are returned and the register works to the earlier.
 *
 * N4 — A CLOCK WAITING ON SOMETHING HAS NO DEADLINE, NOT A GUESSED ONE.
 * Identity asked for and not yet received, a fee charged and not yet paid, a
 * clarification asked for and not yet answered: each returns a null date and a
 * sentence naming what it waits on. An input never recorded is treated exactly
 * like one recorded as not applicable only where the Article itself says so —
 * no identity request means identity cannot move the start — and never becomes
 * a zero-day pause on a limb the pause could apply to.
 *
 * PURE. Calendar days as 'YYYY-MM-DD'. The caller turns a recorded moment into
 * the UK day it fell on (localDate in src/web/localtime.ts); nothing here reads a
 * clock, a database or a setting.
 */

export const LIMBS = ['ART_15', 'ART_16', 'ART_17', 'ART_18', 'ART_21', 'ART_22A_22D'] as const;
export type Limb = (typeof LIMBS)[number];

export const LIMB_LABELS: Readonly<Record<Limb, string>> = Object.freeze({
  ART_15: 'Art 15',
  ART_16: 'Art 16',
  ART_17: 'Art 17',
  ART_18: 'Art 18',
  ART_21: 'Art 21',
  ART_22A_22D: 'Art 22A–22D',
});

export const EXTENSION_GROUNDS = ['COMPLEXITY', 'NUMBER'] as const;
export type ExtensionGround = (typeof EXTENSION_GROUNDS)[number];

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type Ymd = { y: number; m: number; d: number }; // m is 1..12

function parse(day: string): Ymd {
  const hit = DAY.exec(day);
  if (!hit) throw new RangeError(`not a calendar day: ${JSON.stringify(day)}`);
  const ymd = { y: Number(hit[1]), m: Number(hit[2]), d: Number(hit[3]) };
  if (ymd.m < 1 || ymd.m > 12 || ymd.d < 1 || ymd.d > daysInMonth(ymd.y, ymd.m)) {
    throw new RangeError(`not a calendar day: ${JSON.stringify(day)}`);
  }
  return ymd;
}

function fmt({ y, m, d }: Ymd): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function serial(day: string): number {
  const { y, m, d } = parse(day);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

function fromSerial(n: number): string {
  const t = new Date(n * 86_400_000);
  return fmt({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() });
}

export function addDays(day: string, n: number): string {
  return fromSerial(serial(day) + n);
}

/** Calendar days from `from` to `to`, counting both ends. 10 March to 24 March is 15. */
export function inclusiveDays(from: string, to: string): number {
  return serial(to) - serial(from) + 1;
}

/** "17 April" — the pack's worked computations carry no year, the register's cells do. */
export function spoken(day: string): string {
  const { y, m, d } = parse(day);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export type PeriodEnd = {
  /** The conservative reading. The register works to this. */
  end: string;
  /** The alternative reading — ending ON the corresponding date — only where it differs. */
  alternative_end: string | null;
};

/**
 * A period of `months` months BEGINNING WITH `day` (pack 2.5.3).
 * Conservative: the day before the corresponding date `months` later; where that
 * month has no corresponding date, the last day of that shorter month.
 */
export function monthsBeginningWith(day: string, months: number): PeriodEnd {
  const { y, m, d } = parse(day);
  const index = (y * 12 + (m - 1)) + months;
  const ty = Math.floor(index / 12);
  const tm = (index % 12) + 1;
  const last = daysInMonth(ty, tm);
  if (d > last) {
    const end = fmt({ y: ty, m: tm, d: last });
    return { end, alternative_end: null };
  }
  const corresponding = fmt({ y: ty, m: tm, d });
  const end = addDays(corresponding, -1);
  return { end, alternative_end: corresponding };
}

// ---------------------------------------------------------------------------
// ARTICLE 12A — one limb
// ---------------------------------------------------------------------------

export type LimbClockInput = {
  limb: Limb;
  /** 12A(2)(a). The day Caprebate received it — not the day the DPO read it (Trap 1). */
  receipt: string;
  /** 12(6)(a). Only a request actually made can move the start. null = none made. */
  id_requested: string | null;
  id_received: string | null;
  /** 12(5). null = not charged, the expected answer on every entry. */
  fee_charged: string | null;
  fee_paid: string | null;
  /** 12A(5). Article 15 limb only — recorded on another limb it is refused, not ignored. */
  clarification_requested: string | null;
  clarification_received: string | null;
  /** 12A(3), (4). */
  extension_notified: string | null;
  extension_ground: ExtensionGround | null;
  /** The reasons AS GIVEN TO THE DATA SUBJECT (12A(4)(b)). */
  extension_reasons: string | null;
  responded: string | null;
};

export type RelevantTimeSource = 'RECEIPT' | 'IDENTITY' | 'FEE';

export type LimbClock = {
  limb: Limb;
  /** null while identity or a fee it waits on is outstanding. */
  relevant_time: string | null;
  relevant_time_source: RelevantTimeSource | null;
  days_not_counted: number | null;
  days_not_counted_reason: string;
  extension_notice_deadline: PeriodEnd | null;
  extension_valid: boolean | null;
  extension_reading: string;
  applicable_period_end: PeriodEnd | null;
  in_time: 'YES' | 'NO' | null;
  /** The arithmetic, shown in the cell (pack 2.4). */
  working: string[];
  /** What the clock waits on, when it cannot be computed. Empty when it can. */
  waiting_on: string[];
};

export class ClockInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClockInputError';
  }
}

function notBefore(label: string, day: string | null, floor: string, floorLabel: string): void {
  if (day !== null && serial(day) < serial(floor)) {
    throw new ClockInputError(`${label} (${day}) is before ${floorLabel} (${floor})`);
  }
}

export function limbClock(input: LimbClockInput): LimbClock {
  const i = input;
  parse(i.receipt);
  if (i.id_received !== null && i.id_requested === null) {
    throw new ClockInputError('identity information received with no Article 12(6) request recorded: only a request actually made can move the relevant time');
  }
  if (i.fee_paid !== null && i.fee_charged === null) {
    throw new ClockInputError('a fee paid with no Article 12(5) charge recorded');
  }
  if (i.clarification_received !== null && i.clarification_requested === null) {
    throw new ClockInputError('clarification received with no Article 12A(5) request recorded');
  }
  if (i.limb !== 'ART_15' && (i.clarification_requested !== null || i.clarification_received !== null)) {
    throw new ClockInputError(`Article 12A(5) applies to Article 15 requests only; a clarification cannot be recorded on the ${LIMB_LABELS[i.limb]} limb`);
  }
  if (i.extension_ground !== null && !(EXTENSION_GROUNDS as readonly string[]).includes(i.extension_ground)) {
    throw new ClockInputError('an extension is available for the complexity or the number of the requests, and nothing else (12A(3))');
  }
  notBefore('identity requested', i.id_requested, i.receipt, 'receipt');
  notBefore('identity received', i.id_received, i.id_requested ?? i.receipt, 'identity requested');
  notBefore('fee charged', i.fee_charged, i.receipt, 'receipt');
  notBefore('fee paid', i.fee_paid, i.fee_charged ?? i.receipt, 'fee charged');
  notBefore('clarification requested', i.clarification_requested, i.receipt, 'receipt');
  notBefore('clarification received', i.clarification_received, i.clarification_requested ?? i.receipt, 'clarification requested');
  notBefore('responded', i.responded, i.receipt, 'receipt');

  const working: string[] = [];
  const waiting_on: string[] = [];

  // 12A(2) — the relevant time.
  if (i.id_requested !== null && i.id_received === null) {
    waiting_on.push(`identity information asked for on ${spoken(i.id_requested)} under Art 12(6)(a) and not yet received — the relevant time is when it arrives (12A(2)(b))`);
  }
  if (i.fee_charged !== null && i.fee_paid === null) {
    waiting_on.push(`a fee charged on ${spoken(i.fee_charged)} under Art 12(5) and not yet paid — the relevant time is when it is paid (12A(2)(c))`);
  }

  let relevant_time: string | null = null;
  let relevant_time_source: RelevantTimeSource | null = null;
  if (waiting_on.length === 0) {
    const candidates: [RelevantTimeSource, string][] = [['RECEIPT', i.receipt]];
    if (i.id_received !== null) candidates.push(['IDENTITY', i.id_received]);
    if (i.fee_paid !== null) candidates.push(['FEE', i.fee_paid]);
    let best = candidates[0]!;
    for (const c of candidates) if (serial(c[1]) > serial(best[1])) best = c;
    relevant_time = best[1];
    relevant_time_source = best[0];
    const cite = { RECEIPT: '12A(2)(a), receipt', IDENTITY: '12A(2)(b), identity information received', FEE: '12A(2)(c), fee paid' }[best[0]];
    working.push(`relevant time = ${spoken(relevant_time)} (${cite}; the latest of ${candidates.map((c) => spoken(c[1])).join(', ')})`);
  }

  // 12A(5) — days not counted.
  let days_not_counted: number | null;
  let days_not_counted_reason: string;
  if (i.limb !== 'ART_15') {
    days_not_counted = 0;
    days_not_counted_reason = 'NOT APPLICABLE — Art 12A(5) applies to Art 15 requests only';
  } else if (i.clarification_requested === null) {
    days_not_counted = 0;
    days_not_counted_reason = 'no clarification was asked for under Art 12A(5)';
  } else if (i.clarification_received === null) {
    days_not_counted = null;
    days_not_counted_reason = `clarification asked for on ${spoken(i.clarification_requested)} and not yet received — the run is paused`;
    waiting_on.push(`clarification asked for on ${spoken(i.clarification_requested)} under Art 12A(5) and not yet received — the days until it arrives do not count`);
  } else {
    days_not_counted = inclusiveDays(i.clarification_requested, i.clarification_received);
    days_not_counted_reason = `the period beginning ${spoken(i.clarification_requested)} and ending ${spoken(i.clarification_received)} (12A(5)(b))`;
  }

  if (relevant_time === null || days_not_counted === null) {
    return {
      limb: i.limb, relevant_time, relevant_time_source, days_not_counted, days_not_counted_reason,
      extension_notice_deadline: null, extension_valid: null,
      extension_reading: i.extension_notified === null ? 'no extension notified' : 'cannot be judged until the clock can be computed',
      applicable_period_end: null, in_time: null, working, waiting_on,
    };
  }

  const shift = (p: PeriodEnd): PeriodEnd => ({
    end: addDays(p.end, days_not_counted!),
    alternative_end: p.alternative_end === null ? null : addDays(p.alternative_end, days_not_counted!),
  });

  const oneMonth = monthsBeginningWith(relevant_time, 1);
  const notice = shift(oneMonth);
  working.push(`one month beginning with ${spoken(relevant_time)} ends ${spoken(oneMonth.end)} (the cautious reading)`);
  if (days_not_counted > 0) {
    working.push(`+ ${days_not_counted} days not counted = ${spoken(notice.end)}; the extension-notice deadline moves with it (12A(5)(b)(ii))`);
  }

  // 12A(3), (4) — an extension is a NOTICE given in time, with reasons, on a closed ground.
  let extension_valid: boolean | null = null;
  let extension_reading = 'no extension notified';
  let end = notice;
  if (i.extension_notified !== null) {
    const late = serial(i.extension_notified) > serial(notice.end);
    const reasons = (i.extension_reasons ?? '').trim();
    if (late) {
      extension_valid = false;
      extension_reading = `notice given ${spoken(i.extension_notified)}, after the deadline of ${spoken(notice.end)}: NOT AN EXTENSION (12A(4)(a))`;
    } else if (i.extension_ground === null) {
      extension_valid = false;
      extension_reading = 'no reason recorded. An extension is only allowed for complex requests or many requests (12A(3)) — NOT AN EXTENSION';
    } else if (reasons === '') {
      extension_valid = false;
      extension_reading = 'the notice does not state the reasons for the delay (12A(4)(b)): NOT AN EXTENSION';
    } else {
      extension_valid = true;
      const three = shift(monthsBeginningWith(relevant_time, 3));
      end = three;
      extension_reading = `validly extended by notice on ${spoken(i.extension_notified)}, on the ground of ${i.extension_ground === 'COMPLEXITY' ? 'complexity' : 'number'}`;
      working.push(`+ two months, validly extended = ${spoken(three.end)}`);
    }
  }
  working.push(`applicable period end = ${spoken(end.end)}`);
  if (end.alternative_end !== null && end.alternative_end !== end.end) {
    working.push(`(on the alternative reading ${spoken(end.alternative_end)}; Cap Rebate works to the earlier)`);
  }

  let in_time: 'YES' | 'NO' | null = null;
  if (i.responded !== null) {
    in_time = serial(i.responded) <= serial(end.end) ? 'YES' : 'NO';
    working.push(`responded ${spoken(i.responded)} ${in_time === 'YES' ? 'on or before' : 'AFTER'} ${spoken(end.end)}: in time ${in_time}`);
  }

  return {
    limb: i.limb, relevant_time, relevant_time_source, days_not_counted, days_not_counted_reason,
    extension_notice_deadline: notice, extension_valid, extension_reading,
    applicable_period_end: end, in_time, working, waiting_on,
  };
}

// ---------------------------------------------------------------------------
// s.164A(3) — the complaint acknowledgement
// ---------------------------------------------------------------------------

export type AckClock = {
  acknowledgement_deadline: string;
  ack_in_time: 'YES' | 'NO' | null;
  working: string[];
};

/** Thirty calendar days beginning with the day of receipt: day of receipt is day 1, the deadline is day 30. */
export function acknowledgementClock(receipt: string, acknowledged: string | null): AckClock {
  const deadline = addDays(receipt, 29);
  const working = [`received ${spoken(receipt)} = day 1; 30 days beginning with it ends ${spoken(deadline)} (s.164A(3); calendar days; nothing moves it)`];
  let ack_in_time: 'YES' | 'NO' | null = null;
  if (acknowledged !== null) {
    notBefore('acknowledged', acknowledged, receipt, 'receipt');
    ack_in_time = serial(acknowledged) <= serial(deadline) ? 'YES' : 'NO';
    working.push(`acknowledged ${spoken(acknowledged)} ${ack_in_time === 'YES' ? 'on or before' : 'AFTER'} ${spoken(deadline)}: in time ${ack_in_time}`);
  }
  return { acknowledgement_deadline: deadline, ack_in_time, working };
}

/* ================================================================== *
 * A COMPLAINT'S OWN TARGETS — PHASE 153c, 4 October 2026 (Word question 178, Sadique's: "How often
 * should someone who complained get updates, and when should it be finished?"). Built on our recommendation for him
 * to check: an update at least every 28 days, and our own target of one calendar month from receipt to the outcome.
 * NEITHER IS A LEGAL DEADLINE and the words say so: the law asks only that a complaint is answered "without undue
 * delay" (s.164A(4)), and these are what we hold ourselves to. Pure: the same days give the same dates.
 * ================================================================== */

/** The same day one calendar month later, kept within the month (31 January gives 28 or 29 February). */
export function addCalendarMonth(day: string): string {
  const { y, m, d } = parse(day);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return fmt({ y: ny, m: nm, d: Math.min(d, daysInMonth(ny, nm)) });
}

export const COMPLAINT_UPDATE_EVERY_DAYS = 28;
export const COMPLAINT_TARGET_NOTE =
  'These are our own targets, not legal deadlines. The law asks for an answer without undue delay (s.164A(4)). ' +
  'We aim to tell the person how it is going at least every 28 days, and sooner if the time we expect changes, ' +
  'and to give the outcome within one month of receiving it.';

export type ComplaintTargets = {
  /** The last time the person was told anything: the latest progress update, the acknowledgement, or receipt. */
  readonly last_told: string;
  /** last_told + 28 days. Null once the outcome has been told: nothing more is due. */
  readonly next_update_due: string | null;
  /** One calendar month from the day it was received. */
  readonly target_outcome: string;
  readonly note: string;
};

export function complaintTargets(received: string, acknowledged: string | null, progress: readonly string[], outcomeTold: string | null): ComplaintTargets {
  const told = [received, ...(acknowledged === null ? [] : [acknowledged]), ...progress].filter((x) => DAY.test(x)).sort();
  const last_told = told[told.length - 1] ?? received;
  return {
    last_told,
    next_update_due: outcomeTold === null ? addDays(last_told, COMPLAINT_UPDATE_EVERY_DAYS) : null,
    target_outcome: addCalendarMonth(received),
    note: COMPLAINT_TARGET_NOTE,
  };
}
