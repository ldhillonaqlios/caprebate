/**
 * THE DOCUMENT READER'S TWO FOLLOW-ONS.   Phase 146i, 23 September 2026.
 *
 * Phase 146g wired the reader into the upload flow and left it switched off. Two things about it were true from
 * that day and neither had anywhere to live. They are here together because they are one story: what a reading can
 * keep, and what a person is told about a reading that did not work.
 *
 * ------------------------------------------------------------------------------------------------------------
 * 1 · THE TWO FIELDS NOBODY CAN VOUCH FOR
 *
 * `assertClaimsWritable` (04-phase-work/phase3/caprebate-client-doc-ingestion.ts) keeps two CLIENT_DOC fields only
 * on the footing that their value names an ORGANISATION: `grant_funder_name` ("the funding body, not an
 * individual") and `brc_issuing_body` (a local authority rather than an individual approved inspector). The name
 * exclusion register classifies by field NAME and never sees a value, so it cannot tell one from the other; the
 * caller must assert it, and an absent assertion fails closed. That refusal is CORRECT AND IS NOT TOUCHED HERE.
 *
 * WHAT WAS WRONG IS THAT NOBODY COULD EVER ANSWER IT. `UploadReading.discriminants` defaulted to `{}`, so a grant
 * funding agreement and a building regulations completion certificate had EVERY one of their claims refused — not
 * merely the one field — and the upload reported that nothing was kept. A document type that can never be
 * captured is not a control, it is a hole with a lock on it.
 *
 * SO THE ANSWER IS A PERSON'S, AND IT IS RECORDED. It cannot be inferred from the document; inferring it is
 * exactly what the control exists to prevent. It is asked on the document's own page, of Admin or Sales, and kept
 * against the LOGICAL document rather than one upload of it: a second version of the same agreement is the same
 * agreement, and the answer stands until somebody changes it.
 *
 * AND "NOT SURE" IS "NOT ANSWERED". Only `yes` lets the field be kept. `no`, `not_sure` and no row at all are the
 * same decision, and none of them becomes a guess, a blank or a pass — N4. The row exists so that "somebody looked
 * and was not sure" can be told from "nobody has been asked", which is a fact about the work and not about the
 * claim.
 *
 * ------------------------------------------------------------------------------------------------------------
 * 2 · WHAT HAPPENED WHEN WE READ IT
 *
 * `finishUpload` has returned a `ReadingOutcome` with a reason in plain words since Phase 146g, and nothing drew
 * it anywhere: a document that was sent and came back unreadable looked exactly like one nobody had asked about.
 * One row per reading, and the staff document page draws it.
 *
 * A READING THAT NEVER STARTED IS NOT A READING. No row is written where no reader was wired in, or where
 * `CLAUDE_SWITCHES.DOCUMENT_READING` is false — which is how this ships. With the switch off a finished upload
 * must behave exactly as it did before Phase 146g, and a row is a difference.
 *
 * NEVER A WORD OF THE DOCUMENT, on the screen or in the row. What is kept is a state, a count and a reason.
 */

import type { Db } from '../db.ts';
import type { ReadingState } from './uploads.ts';
import type { ClientDocDiscriminants } from '../../../../04-phase-work/phase3/caprebate-client-doc-ingestion.ts';

/* ================================================================== *
 * 1 · THE TWO FIELDS, AND THE QUESTION EACH ONE ASKS
 * ================================================================== */

export const VOUCH_ANSWERS = Object.freeze(['yes', 'no', 'not_sure'] as const);
export type VouchAnswer = (typeof VOUCH_ANSWERS)[number];

/** The three answers, in the words the buttons carry and the page reads back. */
export const ANSWER_WORDS: Readonly<Record<VouchAnswer, string>> = Object.freeze({
  yes: 'Yes', no: 'No', not_sure: 'Not sure',
});

export function isVouchAnswer(v: unknown): v is VouchAnswer {
  return typeof v === 'string' && (VOUCH_ANSWERS as readonly string[]).includes(v);
}

/**
 * THE SAME TWO ROWS AS `CONDITIONAL_FIELDS` IN THE INGESTION MODULE, with the words a person reads added. The
 * module's rows are the control; these are the question. A test holds the two lists to the same field ids and the
 * same flags, so a third conditional field cannot be added there and asked about nowhere.
 */
export const VOUCHED_FIELDS = Object.freeze([
  Object.freeze({
    doc_type: 'GRANT_FUNDING_AGREEMENT',
    field_id: 'grant_funder_name',
    flag: 'funder_is_body' as const,
    what: 'the name of whoever paid the grant',
    question: 'Is the name of whoever paid the grant an organisation, not a person?',
  }),
  Object.freeze({
    doc_type: 'BUILDING_REGS_COMPLETION',
    field_id: 'brc_issuing_body',
    flag: 'issuing_body_is_organisation' as const,
    what: 'the name of whoever signed the work off',
    question: 'Is the name of whoever signed the work off an organisation, not a person?',
  }),
]);

export type VouchedField = (typeof VOUCHED_FIELDS)[number];

/** The field this kind of document must be vouched for, where there is one. Every other type has none. */
export function vouchedFieldFor(doc_type: string | null | undefined): VouchedField | null {
  if (doc_type === null || doc_type === undefined) return null;
  return VOUCHED_FIELDS.find((f) => f.doc_type === doc_type) ?? null;
}

export function vouchedFieldById(field_id: string): VouchedField | null {
  return VOUCHED_FIELDS.find((f) => f.field_id === field_id) ?? null;
}

/* ================================================================== *
 * 2 · READING AND WRITING A PERSON'S ANSWER
 * ================================================================== */

export type VouchRow = {
  readonly field_id: string;
  readonly answer: VouchAnswer;
  readonly answered_by: string;
  readonly answered_at: string;
};

/** Every answer recorded against one logical document. Usually none or one: no type carries two of these fields. */
export function vouchesFor(db: Db, logical_document_id: string): readonly VouchRow[] {
  return db.all<VouchRow>(
    'SELECT field_id, answer, answered_by, answered_at FROM document_field_vouches WHERE logical_document_id = ? ORDER BY field_id',
    [logical_document_id],
  );
}

/**
 * WHAT `assertClaimsWritable` IS TOLD, for one upload. `doc_id` is the version row; the answer lives on its logical
 * document. A flag is true ONLY on a recorded `yes`: `no`, `not_sure` and silence all leave it absent, which is
 * what the ingestion module reads as "do not keep this field".
 */
export function discriminantsFor(db: Db, doc_id: string): ClientDocDiscriminants {
  const row = db.get<{ logical_document_id: string | null }>(
    'SELECT logical_document_id FROM documents WHERE id = ?', [doc_id]);
  const logical = row?.logical_document_id;
  if (logical === null || logical === undefined) return {};
  const out: { -readonly [K in keyof ClientDocDiscriminants]: boolean } = {};
  for (const v of vouchesFor(db, logical)) {
    if (v.answer !== 'yes') continue;
    const f = vouchedFieldById(v.field_id);
    if (f !== null) out[f.flag] = true;
  }
  return out;
}

/**
 * THE ROW ITSELF, AND NOTHING ELSE. Who may answer, and the note in the audit log, are `vouchDocumentField`'s in
 * src/web/documents.ts — the one place that authorises anything about a document. A later answer replaces an
 * earlier one; the audit log keeps every one of them, in order, with who gave it.
 */
export function writeVouch(
  db: Db, newId: () => string, at: string,
  logical_document_id: string, field_id: string, answer: VouchAnswer, answered_by: string,
): void {
  db.run(
    'INSERT INTO document_field_vouches (id, logical_document_id, field_id, answer, answered_by, answered_at) '
      + 'VALUES (?,?,?,?,?,?) ON CONFLICT (logical_document_id, field_id) DO UPDATE SET '
      + 'answer = excluded.answer, answered_by = excluded.answered_by, answered_at = excluded.answered_at',
    [newId(), logical_document_id, field_id, answer, answered_by, at],
  );
}

/* ================================================================== *
 * 3 · WHAT HAPPENED WHEN WE READ IT
 * ================================================================== */

/** In words, per state. The codes are for a developer; a screen never shows one. */
export const READING_WORDS: Readonly<Record<ReadingState, string>> = Object.freeze({
  NOT_WIRED: 'We did not try to read it',
  SWITCHED_OFF: 'Reading documents is not switched on yet',
  NOT_CONFIGURED: 'We could not read it',
  HUMAN_ONLY: 'A person reads this kind of file, never our reader',
  NOT_READY: 'We did not get as far as reading it',
  NOT_READ: 'We could not read it',
  NOT_WRITTEN: 'We read it and kept nothing from it',
  CLAIMED: 'We read it and kept what it told us',
});

/**
 * THE STATES A ROW IS WRITTEN FOR. `NOT_WIRED` and `SWITCHED_OFF` are left out on purpose: no reading started, and
 * writing a row for one would change what a finished upload does with the switch off.
 */
export function readingIsWorthRecording(state: ReadingState): boolean {
  return state !== 'NOT_WIRED' && state !== 'SWITCHED_OFF';
}

export type ReadingRecord = {
  readonly state: ReadingState;
  readonly why: string;
  readonly fields: number;
  readonly not_found: number;
  readonly left_out: number;
};

export function recordReading(
  db: Db, newId: () => string, at: string, document_id: string, r: ReadingRecord,
): void {
  if (!readingIsWorthRecording(r.state)) return;
  db.run(
    'INSERT INTO document_readings (id, document_id, at, state, why, fields, not_found, left_out) VALUES (?,?,?,?,?,?,?,?)',
    [newId(), document_id, at, r.state, r.why, r.fields, r.not_found, r.left_out],
  );
}

export type ReadingView = {
  readonly version_no: number | null;
  readonly at: string;
  readonly label: string;
  readonly why: string;
  /** True where the reading kept something. Everything else is a reason a person may have to act on. */
  readonly worked: boolean;
};

type ReadingRow = {
  version_no: number | null; at: string; state: string; why: string;
};

/**
 * EVERY READING OF EVERY VERSION OF ONE DOCUMENT, newest first. A state this build has never heard of is drawn as
 * itself rather than dropped: a row nobody can explain is still a row somebody should see.
 */
export function readingsFor(db: Db, logical_document_id: string, stamp: (iso: string) => string): readonly ReadingView[] {
  return db.all<ReadingRow>(
    'SELECT d.version_no AS version_no, r.at AS at, r.state AS state, r.why AS why '
      + 'FROM document_readings r JOIN documents d ON d.id = r.document_id '
      + 'WHERE d.logical_document_id = ? ORDER BY r.at DESC',
    [logical_document_id],
  ).map((r) => ({
    version_no: r.version_no,
    at: stamp(r.at),
    label: READING_WORDS[r.state as ReadingState] ?? r.state,
    why: r.why,
    worked: r.state === 'CLAIMED',
  }));
}

/* ================================================================== *
 * 4 · THE QUESTION ON THE PAGE
 * ================================================================== */

export type VouchView = {
  readonly field_id: string;
  readonly question: string;
  readonly what: string;
  readonly answer: VouchAnswer | null;
  readonly answered: string | null;
  readonly by: string | null;
  /** What this answer does, in words. Three of the four possible answers do the same thing. */
  readonly effect: string;
  readonly may_answer: boolean;
};

/** What a `no`, a `not_sure` and an unanswered question all do, said once. */
export const LEFT_OUT_NOTE =
  'Answer this before the file is sent. We cannot add it to a file we have read and deleted.';

export function vouchEffect(answer: VouchAnswer | null): string {
  if (answer === 'yes') return 'We keep it.';
  if (answer === null) return 'We leave it out until somebody answers.';
  return 'We leave it out.';
}

/**
 * THE PANEL, OR NOTHING. Only a type that carries one of the two fields has a question to ask; every other document
 * shows none, because there is nothing about it a person could vouch for.
 */
export function vouchView(
  db: Db, logical_document_id: string, doc_type: string | null, may_answer: boolean,
  stamp: (iso: string) => string, roleOf: (user_id: string) => string,
): VouchView | null {
  const f = vouchedFieldFor(doc_type);
  if (f === null) return null;
  const row = vouchesFor(db, logical_document_id).find((v) => v.field_id === f.field_id) ?? null;
  return {
    field_id: f.field_id,
    question: f.question,
    what: f.what,
    answer: row === null ? null : row.answer,
    answered: row === null ? null : stamp(row.answered_at),
    by: row === null ? null : roleOf(row.answered_by),
    effect: vouchEffect(row === null ? null : row.answer),
    may_answer,
  };
}
