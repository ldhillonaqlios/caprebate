/**
 * THE TITLE REGISTER, BY HAND — Phase 146k, 25 September 2026.
 *
 * Lakhbir, 25 September 2026: HM Land Registry's title register "will be done manually and not via API". The
 * Business Gateway details were taken out of the key file the same day. So the paid lookup Phase 146d built
 * (src/connectors/hmlr-title.ts) no longer runs on "Run the research" — it is retired, not deleted — and a person who
 * has bought the official copy of the register (HM Land Registry's own portal, about £7 a title) records what it says
 * here, on the property page.
 *
 * WHAT IS RECORDED, AND WHAT IS NOT. The same fields the lookup kept, as the name exclusion register lists them for
 * this source: the title number, freehold or leasehold, the price paid and its date, how many restrictions the
 * register carries, the owner's company number where the owner is a company, and how many earlier owners it names.
 * NEVER A PERSON'S NAME. The lookup could keep a private owner's name under Exception 2 of the name exclusion
 * register, because the register gave it to us in a field we could mark; a name typed into a box by a member of staff
 * is a different thing, and this form has no box for one. Where the owner is a person, that is simply not recorded.
 *
 * THROUGH THE ONE DOOR. The entry is stored by `ingestRegisterRecord` as a register record of source HMLR_TITLE, keyed
 * "by-hand:<title number>" so it is never mistaken for a lookup's, and so every reader of register records — the checks
 * panel (where it carries its own chip), the surveyor's payload with the price withheld, the retention clock — reads it
 * as it read the lookup's. `title_by_hand` (migration 055) records the PERSON's act: who typed it and when.
 *
 * WHO, AND WHEN. Admin or Sales (`property.write`), and only once the engagement letter is signed, asserted on the
 * server against the signature record — the same moment the paid lookup waited for (business rule 13(c)), because the
 * official copy is a purchase made for a client.
 *
 * AND IT CAN BE TAKEN BACK, which Phase 146j learned the hard way is not optional: a separate act, with a reason, that
 * removes the one record this entry wrote, refuses while a person has approved a fact from it, lists what was worked
 * out from it while it stood (src/web/take-back.ts), and keeps the entry with who took it back and why.
 */

import { personIsClients, fillTenureFromRegisters } from './who-claims.ts';
import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { authorise, can, type Actor } from '../authz.ts';
import { assertSignedEngagement } from './research.ts';
import { ingestRegisterRecord, removeRegisterRecord } from '../stubs/registers.ts';
import { amount } from '../connectors/hmlr-title.ts';
import {
  approvedFieldsOf, lookAgainAfter, lookAgainJson, lookAgainSummary, takeBackReason, type LookAgain,
} from './take-back.ts';

export type TitleDeps = { readonly db: Db; readonly audit: AuditLog; readonly now: () => string; readonly newId: () => string };
export type TitleResult =
  | { readonly ok: true; readonly why: string; readonly look_again?: readonly LookAgain[] }
  | { readonly ok: false; readonly why: string; readonly field?: string };

/** The register source an entry is stored under, and the prefix that marks it as typed by a person. */
export const TITLE_SOURCE = 'HMLR_TITLE';
export const BY_HAND_PREFIX = 'by-hand:';

type PropertyRef = { readonly id: string; readonly business_id: string; readonly jurisdiction: string | null };

function propertyOf(db: Db, property_id: string): PropertyRef | null {
  return db.get<PropertyRef>('SELECT id, business_id, jurisdiction FROM properties WHERE id = ?', [property_id]) ?? null;
}

const writeObj = (p: PropertyRef) => ({ type: 'property' as const, id: p.id, business_id: p.business_id, assigned_surveyor_ids: [] as string[] });

/** Admin or Sales on this property — a refusal of the right throws — and the letter signed, asked on the server. */
function mayRecord(db: Db, actor: Actor, p: PropertyRef): { ok: true } | { ok: false; why: string } {
  authorise(actor, 'property.write', writeObj(p));
  const e = assertSignedEngagement(db, p.business_id);
  return e.signed === true ? { ok: true }
    : { ok: false, why: `You can record the title register once the engagement letter is signed. Right now ${e.why}.` };
}

/* ================================================================== *
 * 1 · READING THE FORM
 * ================================================================== */

export type TitleForm = {
  readonly title_number?: string | null;
  readonly tenure?: string | null;
  readonly price_paid?: string | null;
  readonly transaction_date?: string | null;
  readonly restriction_count?: string | null;
  readonly proprietor_company_number?: string | null;
  readonly prior_owner_count?: string | null;
  /** PHASE 159g (item 6): where the owner is a PERSON, their name as the register shows it — compared with the client's
   *  own people when it is saved, and only the answer kept. The name itself is never stored. */
  readonly owner_person_name?: string | null;
};

const blank = (v: string | null | undefined): boolean => v === null || v === undefined || v.trim() === '';

/** A title number as HM Land Registry writes one: up to three letters, then digits — "WYK123456", "AGL12345". */
export function titleNumber(v: string | null | undefined): string | null {
  const t = (v ?? '').replace(/\s+/g, '').toUpperCase();
  return /^([A-Z]{1,3}\d{1,9}|\d{1,9})$/.test(t) && t.length <= 12 ? t : null;
}

function count(v: string | null | undefined): number | null | 'bad' {
  if (blank(v)) return null;
  const t = (v ?? '').trim();
  return /^\d{1,3}$/.test(t) ? Number(t) : 'bad';
}

/**
 * THE FIELDS, OR WHICH ONE IS WRONG. Only what the form was given is kept: a blank box is left out, never written as
 * 0 or "not known" (N4). Each field is one the name exclusion register keeps for this source.
 */
export function titleFields(f: TitleForm): { ok: true; fields: Record<string, unknown>; title: string } | { ok: false; why: string; field: string } {
  const title = titleNumber(f.title_number);
  if (title === null) return { ok: false, field: 'title_number', why: 'Type the title number as the register shows it, for example WYK123456.' };
  const fields: Record<string, unknown> = { title_number: title };

  const tenure = (f.tenure ?? '').trim().toLowerCase();
  if (tenure === 'freehold' || tenure === 'leasehold') fields['tenure'] = tenure;
  else if (tenure !== '') return { ok: false, field: 'tenure', why: 'Choose freehold or leasehold, or leave it.' };

  if (!blank(f.price_paid)) {
    const p = amount(f.price_paid ?? null);
    if (p === null) return { ok: false, field: 'price_paid', why: 'Type the price paid in pounds, for example 450000, or leave it.' };
    fields['price_paid'] = p;
  }
  if (!blank(f.transaction_date)) {
    const d = (f.transaction_date ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(`${d}T12:00:00.000Z`))) {
      return { ok: false, field: 'transaction_date', why: 'The date is not a real date. Pick one from the calendar, or leave it.' };
    }
    fields['transaction_date'] = d;
  }
  const r = count(f.restriction_count);
  if (r === 'bad') return { ok: false, field: 'restriction_count', why: 'Type how many restrictions as a number, or leave it.' };
  if (r !== null) fields['restriction_count'] = r;
  if (!blank(f.proprietor_company_number)) {
    const c = (f.proprietor_company_number ?? '').replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z0-9]{8}$/.test(c)) return { ok: false, field: 'proprietor_company_number', why: 'A company number has eight letters and numbers, for example 01234567 or SC123456.' };
    fields['proprietor_company_number'] = c;
  }
  const o = count(f.prior_owner_count);
  if (o === 'bad') return { ok: false, field: 'prior_owner_count', why: 'Type how many earlier owners as a number, or leave it.' };
  if (o !== null) fields['prior_owner_count'] = o;
  return { ok: true, fields, title };
}

/* ================================================================== *
 * 2 · RECORDING IT
 * ================================================================== */

type Standing = { id: string; record_id: string; title_number: string; recorded_at: string };

function standing(db: Db, property_id: string): Standing | undefined {
  return db.get<Standing>(
    'SELECT id, record_id, title_number, recorded_at FROM title_by_hand WHERE property_id = ? AND taken_back_at IS NULL', [property_id]);
}

/** RECORD WHAT THE OFFICIAL COPY SAYS. One entry stands per property; a wrong one is taken back first, with a reason. */
export function recordTitleByHand(d: TitleDeps, actor: Actor, property_id: string, form: TitleForm): TitleResult {
  const p = propertyOf(d.db, property_id);
  if (p === null) return { ok: false, why: 'We could not find that property.' };
  const may = mayRecord(d.db, actor, p);
  if (!may.ok) return may;
  if (p.jurisdiction === 'scotland' || p.jurisdiction === 'northern_ireland') {
    return { ok: false, why: `HM Land Registry holds titles in England and Wales. This property is in ${p.jurisdiction === 'scotland' ? 'Scotland, whose register is kept by Registers of Scotland' : 'Northern Ireland, whose register is kept by Land and Property Services'}. Nothing was saved.` };
  }
  if (standing(d.db, p.id) !== undefined) {
    return { ok: false, why: 'A title register is already recorded for this property. If it is wrong, take it back first, with your reason. Nothing was saved.' };
  }
  const read = titleFields(form);
  if (!read.ok) return { ok: false, why: `${read.why} Nothing was saved.`, field: read.field };
  /* PHASE 159g (item 6): A PERSON NAMED AS OWNER. A sole trader's or a partnership's building is registered to the people
     themselves, so no company number can match it and "do you still own it" waited on a recorded answer. The name typed
     here is compared with the client's own people now, in memory, and only YES or NO is kept — as the officers check
     keeps only its answer (Word answer 156). */
  const person = (form.owner_person_name ?? '').replace(/\s+/g, ' ').trim();
  if (person !== '') {
    if (read.fields['proprietor_company_number'] !== undefined) return { ok: false, field: 'owner_person_name', why: 'The owner is either a company or a person. Give the company number or the person’s name, not both. Nothing was saved.' };
    if (person.length > 200) return { ok: false, field: 'owner_person_name', why: 'That name is too long. Nothing was saved.' };
    read.fields['proprietor_personal_match'] = personIsClients(d.db, p.business_id, person) ? 'YES' : 'NO';
  }
  const entity = `${BY_HAND_PREFIX}${read.title}`;
  if (d.db.get('SELECT id FROM register_records WHERE business_id = ? AND source_id = ? AND entity_id = ?', [p.business_id, TITLE_SOURCE, entity]) !== undefined) {
    return { ok: false, why: 'That title is already recorded for this client, on another of its properties. Nothing was saved.' };
  }
  const at = d.now();
  d.db.tx(() => {
    const record_id = ingestRegisterRecord(d.db, d.newId, d.now, p.business_id,
      { sourceId: TITLE_SOURCE, entityId: entity, fields: read.fields }, { property_id: p.id });
    d.db.run(
      'INSERT INTO title_by_hand (id, business_id, property_id, record_id, title_number, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [d.newId(), p.business_id, p.id, record_id, read.title, actor.id, at]);
    // PHASE 159g (item 4): the tenure the register gives, on the property, where none is recorded yet.
    fillTenureFromRegisters(d.db, p.id, at);
    d.audit.append({
      at, kind: 'TITLE_RECORDED_BY_HAND', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'property', object_id: p.id,
      // Which facts were given, never their values.
      detail: { business: p.business_id, fields: Object.keys(read.fields).sort().join(',') },
    });
  });
  const match = read.fields['proprietor_personal_match'];
  return { ok: true, why: `Saved. What the title register says is on this property now, marked as entered by hand.${match === 'YES' ? ' The owner it names is one of the client’s own people. We kept only that, not the name.' : match === 'NO' ? ' The owner it names is not one of the client’s people on our records. We kept only that, not the name.' : ''}` };
}

/* ================================================================== *
 * 3 · TAKING IT BACK
 * ================================================================== */

export function takeBackTitleByHand(d: TitleDeps, actor: Actor, property_id: string, reasonIn: string | null): TitleResult {
  const p = propertyOf(d.db, property_id);
  if (p === null) return { ok: false, why: 'We could not find that property.' };
  authorise(actor, 'property.write', writeObj(p));
  const s = standing(d.db, p.id);
  if (s === undefined) return { ok: false, why: 'There is no title register recorded on this property, so there is nothing to take back.' };
  const rec = d.db.get<{ id: string; source_id: string; obtained_at: string; property_id: string | null }>(
    'SELECT id, source_id, obtained_at, property_id FROM register_records WHERE id = ? AND business_id = ?', [s.record_id, p.business_id]);
  if (rec === undefined) return { ok: false, why: 'The record this entry wrote is not where it says it is, so nothing was taken out.' };
  if (approvedFieldsOf(d.db, p.business_id, rec.id).length > 0) {
    return { ok: false, why: 'A person has checked and approved a fact from this title register. We do not take it out from under them. ' +
      'Take the tick off first, on the checks panel, with your reason — then take this back.' };
  }
  const why = takeBackReason(reasonIn);
  if (!why.ok) return { ok: false, why: why.why, field: 'reason' };
  const look = lookAgainAfter(d.db, p.business_id, rec);
  const at = d.now();
  d.db.tx(() => {
    d.db.run(
      'UPDATE title_by_hand SET record_id = NULL, removed_record_id = ?, taken_back_at = ?, taken_back_by = ?, taken_back_reason = ?, look_again_json = ? WHERE id = ?',
      [rec.id, at, actor.id, why.reason, lookAgainJson(look), s.id]);
    if (!removeRegisterRecord(d.db, p.business_id, rec.id)) throw new Error('the record this entry wrote was not removed');
    d.audit.append({
      at, kind: 'TITLE_BY_HAND_TAKEN_BACK', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'property', object_id: p.id,
      detail: { business: p.business_id, reason: why.reason, look_again: look.map((l) => `${l.kind}:${l.count}`).join(',') },
    });
  });
  return { ok: true, look_again: look, why: `Taken back. What was recorded is gone and your reason is kept. ${lookAgainSummary(look)}` };
}

/* ================================================================== *
 * 4 · WHAT THE PROPERTY PAGE SHOWS
 * ================================================================== */

export type TitleByHandView = {
  /** What stands, in words, with who typed it and when. Null when nothing does. */
  readonly standing: { readonly lines: readonly { readonly label: string; readonly value: string }[]; readonly by: string; readonly at: string } | null;
  /** Entries taken back, newest first, with who, when and why. */
  readonly taken_back: readonly { readonly title_number: string; readonly by: string; readonly at: string; readonly reason: string }[];
  readonly may_record: boolean;
  /** Why not, for somebody who holds the right while the letter is unsigned. Null otherwise. */
  readonly why_not: string | null;
  /**
   * PHASE 146l: the official copies and title plans uploaded for this client (document type TITLE_REGISTER), newest
   * first — the paperwork the typed facts come from. Uploading one is the ordinary upload path, and it is read by a
   * person, never a model.
   */
  readonly copies: readonly { readonly id: string; readonly label: string; readonly at: string }[];
  /** PHASE 146l: whether this login may upload one, which is the ordinary `document.upload` right. */
  readonly may_upload: boolean;
  /** The client the property belongs to, for the upload box. */
  readonly business_id: string;
};

/** PHASE 146l: the document type an official copy is uploaded as (migration 056). */
export const OFFICIAL_COPY_TYPE = 'TITLE_REGISTER';

const LABELS: Readonly<Record<string, string>> = Object.freeze({
  title_number: 'Title number', tenure: 'Freehold or leasehold', price_paid: 'Price paid', transaction_date: 'Date of that price',
  restriction_count: 'Restrictions on the register', proprietor_company_number: 'Owner’s company number', prior_owner_count: 'Earlier owners named',
  proprietor_personal_match: 'The owner is one of the client’s own people',
});

function nameOf(db: Db, user_id: string | null): string {
  if (user_id === null) return 'a member of staff';
  return db.get<{ display_name: string | null }>('SELECT display_name FROM users WHERE id = ?', [user_id])?.display_name ?? 'a member of staff';
}

function valueWords(k: string, v: unknown): string {
  if (k === 'price_paid' && typeof v === 'number') return `£${v.toLocaleString('en-GB')}`;
  if (k === 'proprietor_personal_match') return v === 'YES' ? 'Yes' : v === 'NO' ? 'No' : String(v);
  return String(v);
}

/**
 * THE BLOCK, OR NOTHING. Register data is read only by a login that may read register records, and NOT by the
 * surveyor here: the price paid is withheld from the surveyor everywhere else (src/web/surveyor.ts), and a property
 * page is not a way round that.
 */
export function titleByHandView(db: Db, actor: Actor, property_id: string): TitleByHandView | null {
  const p = propertyOf(db, property_id);
  if (p === null) return null;
  if (actor.role === 'SURVEYING' || actor.role === 'CLIENT') return null;
  if (!can(actor, 'register_record.read', { type: 'register_record', id: p.business_id, business_id: p.business_id })) return null;
  const s = standing(db, p.id);
  let lines: { label: string; value: string }[] = [];
  let by = ''; let at = '';
  if (s !== undefined) {
    const r = db.get<{ fields_json: string }>('SELECT fields_json FROM register_records WHERE id = ?', [s.record_id]);
    try {
      const f = JSON.parse(r?.fields_json ?? '{}') as Record<string, unknown>;
      lines = Object.keys(LABELS).filter((k) => f[k] !== undefined).map((k) => ({ label: LABELS[k] ?? k, value: valueWords(k, f[k]) }));
    } catch { lines = []; }
    const row = db.get<{ recorded_by: string }>('SELECT recorded_by FROM title_by_hand WHERE id = ?', [s.id]);
    by = nameOf(db, row?.recorded_by ?? null); at = s.recorded_at;
  }
  const taken = db.all<{ title_number: string; taken_back_by: string; taken_back_at: string; taken_back_reason: string }>(
    'SELECT title_number, taken_back_by, taken_back_at, taken_back_reason FROM title_by_hand WHERE property_id = ? AND taken_back_at IS NOT NULL ORDER BY taken_back_at DESC',
    [p.id]).map((t) => ({ title_number: t.title_number, by: nameOf(db, t.taken_back_by), at: t.taken_back_at, reason: t.taken_back_reason }));
  const mayWrite = can(actor, 'property.write', writeObj(p));
  const signed = assertSignedEngagement(db, p.business_id);
  const copies = db.all<{ id: string; seq: number; created_at: string }>(
    'SELECT id, seq, created_at FROM logical_documents WHERE business_id = ? AND type_code = ? ORDER BY created_at DESC, seq DESC',
    [p.business_id, OFFICIAL_COPY_TYPE]).map((c) => ({ id: c.id, label: `Official copy ${c.seq}`, at: c.created_at }));
  return {
    copies,
    may_upload: can(actor, 'document.upload', { type: 'business', id: p.business_id }),
    business_id: p.business_id,
    standing: s === undefined ? null : { lines, by, at },
    taken_back: taken,
    may_record: mayWrite && signed.signed === true,
    why_not: mayWrite && signed.signed !== true ? `You can record it once the engagement letter is signed. Right now ${signed.why}.` : null,
  };
}
