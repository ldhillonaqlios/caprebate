/**
 * THE SURVEYOR'S OWN WORDS IN THE SURVEY PACK — PHASE 153g, 4 October 2026.
 *
 * Eight of the pack's chapters ask the surveyor for words rather than a number (the report template's [SURVEYOR]
 * fields, 04-phase-work/phase9/surveyor-valuation-report-template-v2.md). Each is kept like every other pack change:
 * with a reason, under the surveyor's name, never edited (migration 087). The newest row for a field is shown; an empty
 * box clears it. Nothing here is ever drafted for the surveyor: a field nobody wrote reads "not written yet".
 */
import type { Db } from '../db.ts';
import type { Actor } from '../authz.ts';
import { beginPackChange, type PackDeps, type PackResult } from './survey-pack.ts';

export type WordField = 'construction_type' | 'build_year' | 'building_other' | 'dwelling_method' | 'dwelling_segregation'
  | 'land_comparables' | 'land_voa' | 'land_date' | 'land_planning_basis' | 'qpct_basis' | 'disposal_value' | 'sector_core'
  | 'works_scope' | 'narrative_description' | 'narrative_condition' | 'narrative_departures' | 'narrative_opinion';

/** Each field: its chapter, the label on the page and in the report, and the question it asks (the template's). */
export const WORD_FIELDS: Readonly<Record<WordField, { readonly chapter: number; readonly label: string; readonly ask: string }>> = Object.freeze({
  construction_type: { chapter: 5, label: 'Construction type', ask: 'How is the building built?' },
  build_year: { chapter: 5, label: 'Built or last renovated', ask: 'The year it was built, or last renovated.' },
  building_other: { chapter: 5, label: 'Anything else that describes it', ask: 'For example storeys, a listed building, or an extension of a different age.' },
  dwelling_method: { chapter: 8, label: 'How the homes were split from the rest', ask: 'A measured survey or an area apportionment, and where you drew the line.' },
  dwelling_segregation: { chapter: 8, label: 'Can the shared parts be costed apart from the homes?', ask: 'On the documents that exist, can the cost be separated?' },
  land_comparables: { chapter: 11, label: 'Comparables relied on', ask: 'Which sales, and why they compare with this site.' },
  land_voa: { chapter: 11, label: 'Valuation Office figure', ask: 'Is there one, and does it help?' },
  land_date: { chapter: 11, label: 'Date of the land value', ask: 'The purchase date, or another date, and why.' },
  land_planning_basis: { chapter: 11, label: 'Planning basis of the land value', ask: 'As it is used now, as consented for this use, or for the best other use?' },
  qpct_basis: { chapter: 14, label: 'The basis for the percentages', ask: 'Survey, HMRC practice or something else, for each kind of item.' },
  disposal_value: { chapter: 16, label: 'Disposal value', ask: 'The value on a sale and leaseback, if there is one, and on what basis.' },
  sector_core: { chapter: 19, label: 'This sector’s main judgement', ask: 'Your answer to the question above, and why.' },
  works_scope: { chapter: 20, label: 'What you saw of the works', ask: 'What physically changed, as far as you could see or read.' },
  narrative_description: { chapter: 22, label: 'The property and its use', ask: 'What is this building, what happens in it, and what drives the fixtures in it?' },
  narrative_condition: { chapter: 22, label: 'Condition, and anything that changes the figures', ask: 'Anything you saw that changes the numbers: wear, a part not in use, a defect.' },
  narrative_departures: { chapter: 22, label: 'Departures from the usual method', ask: 'Where you did not follow the residual method, and what you did instead.' },
  narrative_opinion: { chapter: 22, label: 'Your opinion on the split', ask: 'Is the result reasonable, and where is it most open to challenge?' },
});

export const WORD_FIELD_NAMES = Object.keys(WORD_FIELDS) as WordField[];

export type Words = { readonly words: string | null; readonly by_name: string; readonly at: string; readonly reason: string };

/** The newest words for each field of a pack. A field nobody wrote is absent; one cleared is present with null words. */
export function packWords(db: Db, pack_id: string | null): ReadonlyMap<WordField, Words> {
  const out = new Map<WordField, Words>();
  if (pack_id === null) return out;
  for (const r of db.all<{ field: WordField; words: string | null; by_name: string; at: string; reason: string }>(
    'SELECT w.field, w.words, u.display_name AS by_name, w.at, w.reason FROM survey_pack_words w JOIN users u ON u.id = w.by_user ' +
    'WHERE w.pack_id = ? ORDER BY w.at, w.rowid', [pack_id])) {
    out.set(r.field, { words: r.words, by_name: r.by_name, at: r.at, reason: r.reason });
  }
  return out;
}

/** Write (or clear, with an empty box) one field, with the reason, under the surveyor's name. */
export function savePackWords(d: PackDeps, actor: Actor, job_id: string, f: { field: string; words: string; reason: string; seq: string }): PackResult {
  if (!(WORD_FIELD_NAMES as string[]).includes(f.field)) return { ok: false, field: 'field', why: 'That is not one of the pack’s questions.' };
  const field = f.field as WordField;
  const words = f.words.trim() === '' ? null : f.words.trim();
  if (words !== null && words.length > 4000) return { ok: false, field: 'words', why: 'Keep it under 4,000 characters.' };
  return beginPackChange(d, actor, job_id, f.reason, f.seq, ({ view, pack_id }) => {
    const was = packWords(d.db, pack_id).get(field);
    if (words === null && (was === undefined || was.words === null)) return { ok: false, field: 'words', why: 'Nothing is written yet, so there is nothing to clear.' };
    if (words !== null && was?.words === words) return { ok: false, field: 'words', why: 'That is already what it says. Nothing changed.' };
    d.db.run('INSERT INTO survey_pack_words (id, pack_id, field, words, by_user, reason, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [d.newId(), pack_id, field, words, actor.id, f.reason.trim(), d.now()]);
    d.audit.append({ at: d.now(), kind: 'SURVEY_PACK_CHANGED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'surveyor_job', object_id: view.job.id, detail: { what: 'words', line: '', fields: field } });
    return { ok: true };
  });
}
