/**
 * THE CONFIGURABLE LISTS — READ FROM THE DATABASE, NEVER FROM A CONSTANT.
 * CRM 9 of 10, 12 September 2026.
 *
 * `vocabularies` (migration 019) holds the lead sources, the priorities, the task
 * activity types, the property types and the introducer types, seeded from the
 * lists the code shipped with. An ADMIN adds a value, relabels one or retires one
 * on the settings screen (src/web/configuration.ts); nothing is ever deleted, a code
 * is permanent, and a value the application writes itself — WEBSITE for the funnel,
 * TASK for a rule's task, a firm's type that decides its referral source — is
 * `fixed` and cannot be retired. The database's named triggers read the same table,
 * so a store and the table agree on what is on a list.
 *
 * A RETIRED VALUE STILL READS. A record keeps the value it was given: its label is
 * read from the table whatever its state, and a form that edits the record offers
 * the retired value back as the current one — `keep` — rather than silently changing
 * it. A new record may only take an active value.
 *
 * THE SHIPPED CONSTANTS STAY EXPORTED — `SOURCES`, `PRIORITIES`, `ACTIVITY_TYPES`,
 * `INTRODUCER_TYPES` — as the record of what migration 019 seeded. No store
 * validates against them any more.
 *
 * NOT A LIST HERE, ON PURPOSE: the procedure's stages, the exits, a claim fact's
 * key, the capture sources, the payer classes, the roles and the reciprocity kinds.
 * Each is a rule, and changing one is a migration (configuration.ts refuses each).
 */

import type { Db } from '../db.ts';

type Vocab = Readonly<Record<string, string>>;

export type VocabList = 'LEAD_SOURCE' | 'PRIORITY' | 'ACTIVITY_TYPE' | 'PROPERTY_TYPE' | 'INTRODUCER_TYPE';

export const VOCAB_LISTS: Readonly<Record<VocabList, { readonly label: string; readonly holds: string }>> = Object.freeze({
  LEAD_SOURCE: { label: 'Lead sources', holds: 'where a lead came from, and an organisation’s source' },
  PRIORITY: { label: 'Priorities', holds: 'a claim’s, a lead’s and a task’s priority — the later on the list, the higher' },
  ACTIVITY_TYPE: { label: 'Task types', holds: 'what kind of activity a task is. The three things we do for introducers in return are not on this list' },
  PROPERTY_TYPE: { label: 'Property types', holds: 'what kind of building a property is' },
  INTRODUCER_TYPE: { label: 'Introducer types', holds: 'what kind of firm an introducer is' },
});

export function isVocabList(v: unknown): v is VocabList {
  return typeof v === 'string' && Object.hasOwn(VOCAB_LISTS, v);
}

export type VocabValue = {
  readonly code: string;
  readonly label: string;
  readonly ord: number;
  readonly active: boolean;
  readonly fixed: boolean;
  readonly source: string;
};

export function vocabularyValues(db: Db, list: VocabList): VocabValue[] {
  return db.all<{ code: string; label: string; ord: number; active: number; fixed: number; source: string }>(
    'SELECT code, label, ord, active, fixed, source FROM vocabularies WHERE list = ? ORDER BY ord ASC, code ASC', [list],
  ).map((r) => ({ code: r.code, label: r.label, ord: r.ord, active: r.active === 1, fixed: r.fixed === 1, source: r.source }));
}

/**
 * THE CHOICES A FORM OFFERS: every active value, in order — and `keep`, the record's own value, where it is one the
 * list has retired, so that saving the form never changes a value nobody touched.
 */
export function vocabulary(db: Db, list: VocabList, keep: string | null = null): Vocab {
  const out: Record<string, string> = {};
  for (const v of vocabularyValues(db, list)) {
    if (v.active || v.code === keep) out[v.code] = v.active ? v.label : `${v.label} (retired)`;
  }
  return Object.freeze(out);
}

/** A value's label, whatever its state. A value the list has never held — recorded before it existed — reads as written. */
export function vocabLabel(db: Db, list: VocabList, code: string | null | undefined, none: string): string {
  if (code === null || code === undefined || code === '') return none;
  return db.get<{ label: string }>('SELECT label FROM vocabularies WHERE list = ? AND code = ?', [list, code])?.label ?? code;
}

/** May a record take this value now? Only an active one — or the value it already holds. */
export function mayTake(db: Db, list: VocabList, code: string, stored: string | null = null): boolean {
  if (stored !== null && code === stored) return true;
  return db.get<{ active: number }>('SELECT active FROM vocabularies WHERE list = ? AND code = ?', [list, code])?.active === 1;
}

type Check<T> = { ok: true; value: T } | { ok: false; why: string };

/** A posted choice, checked against the list: blank is nothing, an active value or the stored one is kept, anything else refused. */
export function vocabChoice(db: Db, list: VocabList, v: string | null | undefined, stored: string | null, what: string): Check<string | null> {
  if (v === null || v === undefined || v.trim() === '') return { ok: true, value: null };
  const t = v.trim();
  return mayTake(db, list, t, stored) ? { ok: true, value: t } : { ok: false, why: `${what} is not one of the choices offered.` };
}

export type TaskChoices = { readonly activity: Vocab; readonly priority: Vocab };

/** What a task form offers, read once for the page. */
export function taskChoices(db: Db, keep: { activity?: string | null; priority?: string | null } = {}): TaskChoices {
  return { activity: vocabulary(db, 'ACTIVITY_TYPE', keep.activity ?? null), priority: vocabulary(db, 'PRIORITY', keep.priority ?? null) };
}

/**
 * THE ORDER PRIORITIES SORT IN — the later a value stands on the list, the higher. Unset, and a value the list has
 * never held, sort last.
 */
export function priorityRank(db: Db): (code: string | null) => number {
  const ords = new Map(vocabularyValues(db, 'PRIORITY').map((v) => [v.code, v.ord]));
  return (code) => {
    const o = code === null ? undefined : ords.get(code);
    return o === undefined ? Number.MAX_SAFE_INTEGER : -o;
  };
}
