/**
 * THE COMPLIANCE REGISTERS — THE CORE. CRM 8 of 10, 12 September 2026.
 *
 * The schema is migration 017. This file holds what every register shares: the
 * section gate, the dated compliance settings, the reference series, legal holds
 * and restrictions, cross-references, and the one reading the pipeline asks —
 * whether customer due diligence stops a claim leaving ENGAGEMENT. The registers
 * themselves are src/web/compliance-aml.ts, compliance-rights.ts,
 * compliance-breach.ts and compliance-identity.ts; the pages are
 * src/web/compliance-pages.ts; every choice that is not obvious is a row of
 * Part E of 09-app/CAPREBATE-CRM-DISPOSITION.md from E94.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHO — ADMIN, TODAY, AND ONLY BECAUSE NOBODY ELSE CAN
 *
 * None of this is for SALES, ACCOUNTING or SURVEYING. There is no data
 * protection officer role and ADMIN is a super user, not an officer. The
 * design's two-person check — the DPO decides, the controller countersigns — is
 * ONE PERSON in this build: one login types both names. That is recorded on
 * every register page as a known limitation and is never presented as a check.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTHING IS DELETED AND NOTHING IS DUE BY A STORED FLAG
 *
 * Statutory clocks are read by src/web/compliance-clock.ts; retention clocks by
 * src/web/compliance-identity.ts from parameters none of which is approved. A
 * hold blocks a record from the due-for-deletion list; there is no deleter.
 */

import { randomBytes } from 'node:crypto';
import type { Db } from '../db.ts';
import type { AuditLog, AuditKind, Outcome } from '../audit.ts';
import { authorise, type Actor } from '../authz.ts';
import { NotFoundAsRefusal } from './backoffice.ts';
import { instantsForLocalMinute, localDate } from './localtime.ts';

export type ComplianceDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string };
export type Fields = Readonly<Record<string, string | null>>;
export type WriteResult = { ok: true; id: string } | { ok: false; why: string };
export type Vocab = Readonly<Record<string, string>>;
export type Check<T> = { ok: true; value: T } | { ok: false; why: string };

export { NotFoundAsRefusal };

/** Said on every register page, in these words. */
export const TWO_PERSON_LIMITATION =
  'KNOWN LIMITATION — ONE PERSON TODAY. The procedures have the data protection officer decide and the controller ' +
  'countersign. There is no data protection officer role in this application and one Admin login types both names, ' +
  'so nothing here checks that two people were involved. The names typed are a record of what was said, not a control.';

/* ================================================================== *
 * 1 · THE GATE, AND SMALL THINGS
 * ================================================================== */

const SECTION = '__compliance_section__';

export function complianceObj(id: string = SECTION): { type: 'compliance'; id: string } {
  return { type: 'compliance', id };
}

export function assertComplianceRead(actor: Actor): void {
  authorise(actor, 'compliance.read', complianceObj());
}

export function assertComplianceWrite(actor: Actor): void {
  authorise(actor, 'compliance.write', complianceObj());
}

export function has(vocab: Vocab, v: string | null | undefined): v is string {
  return typeof v === 'string' && Object.hasOwn(vocab, v);
}

export function words(vocab: Vocab, v: string | null | undefined, none: string): string {
  return has(vocab, v) ? (vocab[v] ?? v) : none;
}

export function textField(v: string | null | undefined, max: number, what: string): Check<string | null> {
  if (v === null || v === undefined) return { ok: true, value: null };
  const t = v.trim();
  if (t === '') return { ok: true, value: null };
  if (t.length > max) return { ok: false, why: `${what} is longer than we store — ${max.toLocaleString('en-GB')} characters is the limit.` };
  return { ok: true, value: t };
}

export function requiredText(v: string | null | undefined, max: number, what: string): Check<string> {
  const t = textField(v, max, what);
  if (!t.ok) return t;
  if (t.value === null) return { ok: false, why: `${what} is needed.` };
  return { ok: true, value: t.value };
}

export function dateField(v: string | null | undefined, what: string): Check<string | null> {
  if (v === null || v === undefined || v.trim() === '') return { ok: true, value: null };
  const t = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || !Number.isFinite(Date.parse(`${t}T12:00:00.000Z`))
    || new Date(`${t}T12:00:00.000Z`).toISOString().slice(0, 10) !== t) {
    return { ok: false, why: `${what} must be a date, as YYYY-MM-DD.` };
  }
  return { ok: true, value: t };
}

/**
 * A MOMENT — the statutory clocks run from one. A full ISO instant is taken as it
 * is; `YYYY-MM-DDTHH:MM` is a UK wall-clock time, and where the clocks going back
 * make it ambiguous the EARLIER instant is taken, because a clock started earlier
 * can only make Caprebate early.
 */
export function momentField(v: string | null | undefined, what: string): Check<string | null> {
  if (v === null || v === undefined || v.trim() === '') return { ok: true, value: null };
  const t = v.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(t)) {
    const ms = Date.parse(t);
    if (Number.isFinite(ms)) return { ok: true, value: new Date(ms).toISOString() };
  }
  const wall = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(t);
  if (wall) {
    const [y, mo, d, hh, mm] = wall.slice(1).map(Number) as [number, number, number, number, number];
    const day = dateField(`${wall[1]}-${wall[2]}-${wall[3]}`, what);
    if (day.ok && day.value !== null && hh < 24 && mm < 60) {
      const found = instantsForLocalMinute(y, mo, d, hh * 60 + mm).sort((a, b) => a - b);
      const first = found[0];
      if (first !== undefined) return { ok: true, value: new Date(first).toISOString() };
      return { ok: false, why: `${what}: that time did not exist in the UK — the clocks went forward over it.` };
    }
  }
  return { ok: false, why: `${what} must be a date and a time, as YYYY-MM-DDTHH:MM (UK time).` };
}

export function vocabField(v: string | null | undefined, vocab: Vocab, what: string): Check<string | null> {
  if (v === null || v === undefined || v.trim() === '') return { ok: true, value: null };
  return has(vocab, v) ? { ok: true, value: v } : { ok: false, why: `${what} is not one of the choices offered.` };
}

/** The UK day a stored moment fell on — what every statutory clock counts in. */
export function ukDay(iso: string): string {
  return localDate(iso);
}

export function record(
  d: ComplianceDeps, actor: Actor | null, kind: AuditKind, outcome: Outcome, object_type: string, object_id: string,
  detail: Record<string, unknown>,
): void {
  d.audit.append({ at: d.now(), kind, outcome, actor_id: actor?.id ?? null, actor_role: actor?.role ?? null, object_type, object_id, detail });
}

const BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** An opaque reference nobody typed: sixteen characters from a random source, never derived from a name. */
export function opaqueRef(prefix: string): string {
  const bytes = randomBytes(16);
  let out = '';
  for (const b of bytes) out += BASE32[b % 32];
  return `${prefix}-${out}`;
}

/* ================================================================== *
 * 2 · THE REFERENCE SERIES — never reused, never renumbered
 * ================================================================== */

export function nextRef(db: Db, kind: 'RR' | 'CP' | 'PDB'): string {
  db.run('UPDATE compliance_ref_series SET last_n = last_n + 1 WHERE kind = ?', [kind]);
  const n = db.get<{ last_n: number }>('SELECT last_n FROM compliance_ref_series WHERE kind = ?', [kind])?.last_n;
  if (n === undefined) throw new Error(`no reference series for ${kind}`);
  return `${kind}-${String(n).padStart(3, '0')}`;
}

/* ================================================================== *
 * 3 · THE COMPLIANCE SETTINGS — dated, sourced, append-only
 * ================================================================== */

export const SETTINGS: Vocab = Object.freeze({
  AML_IN_SCOPE: 'Customer due diligence is in force',
  INSURANCE_POSITION: 'The insurance position',
});

export const SETTING_VALUES: Readonly<Record<string, Vocab>> = Object.freeze({
  AML_IN_SCOPE: Object.freeze({ false: 'Off — nothing blocks a claim', true: 'On — ENGAGEMENT cannot complete without a finished check' }),
  INSURANCE_POSITION: Object.freeze({ NO_POLICY_IN_FORCE: 'No policy in force', POLICY_IN_FORCE: 'A policy is in force' }),
});

export type SettingReading = {
  readonly setting: string;
  readonly value: string | null;
  readonly label: string;
  readonly effective_from: string | null;
  readonly source: string | null;
};

export function settingReading(db: Db, setting: string, today: string): SettingReading {
  const r = db.get<{ value: string; effective_from: string; source: string }>(
    'SELECT value, effective_from, source FROM compliance_settings WHERE setting = ? AND effective_from <= ? ' +
      'ORDER BY effective_from DESC, rowid DESC LIMIT 1', [setting, ukDay(today)]);
  if (r === undefined) return { setting, value: null, label: 'Not set', effective_from: null, source: null }; // Phase 133c: a setting nobody has recorded reads "Not set"
  return { setting, value: r.value, label: SETTING_VALUES[setting]?.[r.value] ?? r.value, effective_from: r.effective_from, source: r.source };
}

/**
 * IS CUSTOMER DUE DILIGENCE IN FORCE TODAY? Only a recorded `true` says yes. The
 * shipped `false` and a setting nobody recorded read identically: off, which is
 * exactly today's behaviour — nothing blocks a claim.
 */
/*
 * PHASE 132e, 16 SEPTEMBER 2026 — READ AGAINST LAKHBIR'S "we need to do AML check on every client", AND LEFT OFF.
 * The phase brief said: switch it on as business policy only if doing so records checks without refusing a claim for
 * want of a risk rating nobody has defined; if switching it on would refuse or block any work, leave it off. Re-derived
 * in code: ON, `cddGateNeed` below refuses every claim's move out of ENGAGEMENT until a FINISHED check is on record for
 * its organisation (src/web/pipeline.ts). Finishing needs what was identified, how it was verified, an evidence
 * document or register number, the beneficial ownership position (and at least one owner where it is RECORDED), the
 * authority to bind and its evidence, and the date — `missingForCompletion` in compliance-aml.ts. It does NOT need a
 * risk rating (free text or nothing). So it would not refuse for want of a scale, but it WOULD block work at
 * ENGAGEMENT, and so it stays off. A check can be kept on the register for every client today, with the switch off.
 * Turning it on is one dated, sourced record on the compliance page — no code change.
 * NOTHING HERE DECIDES WHETHER MONEY LAUNDERING SUPERVISION LEGALLY APPLIES TO CAPREBATE. That is the question
 * "Is AML supervision legally required for this business?", with the accountant and a solicitor.
 */
export function amlInScope(db: Db, today: string): boolean {
  return settingReading(db, 'AML_IN_SCOPE', today).value === 'true';
}

export function recordSetting(d: ComplianceDeps, actor: Actor, input: Fields): WriteResult {
  assertComplianceWrite(actor);
  const setting = input['setting'] ?? null;
  if (!has(SETTINGS, setting)) return { ok: false, why: 'Choose which setting this is.' };
  const value = input['value'] ?? null;
  if (!has(SETTING_VALUES[setting] ?? {}, value)) return { ok: false, why: 'That is not one of the values this setting takes.' };
  const from = dateField(input['effective_from'], 'The date it takes effect');
  if (!from.ok) return from;
  if (from.value === null) return { ok: false, why: 'Say from when it takes effect.' };
  const source = requiredText(input['source'], 1000, 'Where it comes from');
  if (!source.ok) return source;
  const id = d.newId();
  d.db.run(
    'INSERT INTO compliance_settings (id, setting, value, effective_from, source, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, setting, value, from.value, source.value, actor.id, d.now()]);
  record(d, actor, 'COMPLIANCE_SETTING_RECORDED', 'ALLOWED', 'compliance_setting', id, { setting, value, effective_from: from.value });
  return { ok: true, id };
}

/* ================================================================== *
 * 4 · THE ENGAGEMENT GATE — read by src/web/pipeline.ts
 * ================================================================== */

export type CddNeed = { readonly what: string; readonly met: boolean; readonly why: string };

/**
 * NULL WHILE THE CHECK IS OFF — the pipeline then asks nothing it did not ask
 * before this phase. ON, a claim leaves ENGAGEMENT only once a finished check is
 * on record for its organisation. The words are staff-facing: nothing a client
 * or an accountant reads says a check exists.
 */
export function cddGateNeed(db: Db, business_id: string, today: string): CddNeed | null {
  if (!amlInScope(db, today)) return null;
  const k = db.get<{ completed_at: string }>(
    "SELECT completed_at FROM cdd_checks WHERE business_id = ? AND state = 'COMPLETE' ORDER BY completed_at DESC LIMIT 1", [business_id]);
  return {
    what: 'Customer due diligence is finished for the organisation',
    met: k !== undefined,
    why: k === undefined ? 'no finished customer due diligence check is on record for this organisation' : `finished ${ukDay(k.completed_at)}`,
  };
}

/* ================================================================== *
 * 5 · HOLDS AND RESTRICTIONS
 * ================================================================== */

export const HOLD_KINDS: Vocab = Object.freeze({ LEGAL_HOLD: 'Legal hold — blocks deletion', RESTRICTION: 'Restriction — Article 18' });
export const HOLD_REASONS: Vocab = Object.freeze({
  RIGHTS_REQUEST: 'A rights request is live', COMPLAINT: 'A complaint is live', BREACH: 'A breach entry is live',
  HMRC_ENQUIRY: 'An HMRC enquiry is live', DISPUTE: 'A dispute is live',
});

export type HoldRow = {
  id: string; hold_kind: string; record_kind: string; record_id: string; reason_kind: string; reason: string;
  review_on: string; set_at: string; lifted_at: string | null; lift_reason: string | null;
  rights_request_id: string | null; complaint_id: string | null; incident_id: string | null;
};

export function setHold(d: ComplianceDeps, actor: Actor, input: Fields): WriteResult {
  assertComplianceWrite(actor);
  const hold_kind = input['hold_kind'] ?? null;
  if (!has(HOLD_KINDS, hold_kind)) return { ok: false, why: 'Choose a legal hold or a restriction.' };
  const record_kind = (input['record_kind'] ?? '').trim();
  if (!/^[A-Z0-9_]{2,60}$/.test(record_kind)) return { ok: false, why: 'Name the kind of record held, in capitals.' };
  const record_id = requiredText(input['record_id'], 100, 'The record held');
  if (!record_id.ok) return record_id;
  const reason_kind = input['reason_kind'] ?? null;
  if (!has(HOLD_REASONS, reason_kind)) return { ok: false, why: 'Choose why the record is held.' };
  const reason = requiredText(input['reason'], 2000, 'The reason');
  if (!reason.ok) return reason;
  const review = dateField(input['review_on'], 'The next review date');
  if (!review.ok) return review;
  if (review.value === null) return { ok: false, why: 'A hold carries the date it is next reviewed: one with no review date is treated as expired.' };
  const pointer = (key: string, sql: string): Check<string | null> => {
    const v = (input[key] ?? '').trim();
    if (v === '') return { ok: true, value: null };
    return d.db.get<{ id: string }>(sql, [v]) ? { ok: true, value: v } : { ok: false, why: 'The register entry this hold is for was not found.' };
  };
  const rr = pointer('rights_request_id', 'SELECT id FROM rights_requests WHERE id = ?');
  const cp = pointer('complaint_id', 'SELECT id FROM complaints WHERE id = ?');
  const bi = pointer('incident_id', 'SELECT id FROM breach_incidents WHERE id = ?');
  for (const c of [rr, cp, bi]) if (!c.ok) return c;
  const id = d.newId();
  try {
    d.db.run(
      'INSERT INTO legal_holds (id, hold_kind, record_kind, record_id, reason_kind, rights_request_id, complaint_id, incident_id, reason, review_on, set_by, set_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, hold_kind, record_kind, record_id.value, reason_kind, rr.ok ? rr.value : null, cp.ok ? cp.value : null, bi.ok ? bi.value : null,
        reason.value, review.value, actor.id, d.now()]);
  } catch (e) {
    return { ok: false, why: `The hold was not recorded: ${(e as Error).message.replace(/^.*?: /, '')}` };
  }
  record(d, actor, 'LEGAL_HOLD_SET', 'ALLOWED', 'legal_hold', id, { hold_kind, record_kind, record: record_id.value, reason_kind });
  return { ok: true, id };
}

export function liftHold(d: ComplianceDeps, actor: Actor, id: string, input: Fields): WriteResult {
  assertComplianceWrite(actor);
  const h = d.db.get<{ lifted_at: string | null }>('SELECT lifted_at FROM legal_holds WHERE id = ?', [id]);
  if (h === undefined) throw new NotFoundAsRefusal();
  if (h.lifted_at !== null) return { ok: false, why: 'This hold was lifted already.' };
  const reason = requiredText(input['lift_reason'], 2000, 'The reason it is lifted');
  if (!reason.ok) return reason;
  d.db.run('UPDATE legal_holds SET lifted_at = ?, lifted_by = ?, lift_reason = ? WHERE id = ?', [d.now(), actor.id, reason.value, id]);
  record(d, actor, 'LEGAL_HOLD_LIFTED', 'ALLOWED', 'legal_hold', id, {});
  return { ok: true, id };
}

const HOLD_SELECT =
  'SELECT id, hold_kind, record_kind, record_id, reason_kind, reason, review_on, set_at, lifted_at, lift_reason, ' +
  'rights_request_id, complaint_id, incident_id FROM legal_holds ';

export function holdsFor(db: Db, record_kind: string, record_id: string): HoldRow[] {
  return db.all<HoldRow>(`${HOLD_SELECT}WHERE record_kind = ? AND record_id = ? ORDER BY set_at`, [record_kind, record_id]);
}

export function holdsForEntry(db: Db, column: 'rights_request_id' | 'complaint_id' | 'incident_id', id: string): HoldRow[] {
  const sql = column === 'rights_request_id' ? `${HOLD_SELECT}WHERE rights_request_id = ? ORDER BY set_at`
    : column === 'complaint_id' ? `${HOLD_SELECT}WHERE complaint_id = ? ORDER BY set_at`
      : `${HOLD_SELECT}WHERE incident_id = ? ORDER BY set_at`;
  return db.all<HoldRow>(sql, [id]);
}

/** The live holds, by record kind — what the due-for-deletion list excludes. */
export function liveHeldIds(db: Db, record_kind: string): Set<string> {
  return new Set(db.all<{ record_id: string }>(
    "SELECT record_id FROM legal_holds WHERE record_kind = ? AND lifted_at IS NULL AND hold_kind = 'LEGAL_HOLD'", [record_kind]).map((r) => r.record_id));
}

/* ================================================================== *
 * 6 · CROSS-REFERENCES — one row, read in both directions
 * ================================================================== */

export const LINK_KINDS: Vocab = Object.freeze({ RIGHTS_REQUEST: 'Rights request', COMPLAINT: 'Complaint', BREACH: 'Breach entry' });

const LINK_TABLE: Readonly<Record<string, { sql: string }>> = Object.freeze({
  RIGHTS_REQUEST: { sql: 'SELECT request_ref AS ref FROM rights_requests WHERE id = ?' },
  COMPLAINT: { sql: 'SELECT complaint_ref AS ref FROM complaints WHERE id = ?' },
  BREACH: { sql: 'SELECT incident_ref AS ref FROM breach_incidents WHERE id = ?' },
});

function refOf(db: Db, kind: string, id: string): string | null {
  const t = LINK_TABLE[kind];
  return t === undefined ? null : (db.get<{ ref: string }>(t.sql, [id])?.ref ?? null);
}

export function link(d: ComplianceDeps, actor: Actor, input: Fields): WriteResult {
  assertComplianceWrite(actor);
  const from_kind = input['from_kind'] ?? null;
  const to_kind = input['to_kind'] ?? null;
  const from_id = (input['from_id'] ?? '').trim();
  const to_id = (input['to_id'] ?? '').trim();
  if (!has(LINK_KINDS, from_kind) || !has(LINK_KINDS, to_kind)) return { ok: false, why: 'Choose the two registers the entries are in.' };
  if (refOf(d.db, from_kind, from_id) === null || refOf(d.db, to_kind, to_id) === null) return { ok: false, why: 'One of the two entries was not found.' };
  if (from_kind === to_kind && from_id === to_id) return { ok: false, why: 'An entry is not cross-referenced to itself.' };
  if (linksFor(d.db, from_kind, from_id).some((l) => l.kind === to_kind && l.id === to_id)) return { ok: false, why: 'These two entries are cross-referenced already.' };
  const id = d.newId();
  d.db.run('INSERT INTO compliance_links (id, from_kind, from_id, to_kind, to_id, linked_by, linked_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, from_kind, from_id, to_kind, to_id, actor.id, d.now()]);
  record(d, actor, 'COMPLIANCE_LINKED', 'ALLOWED', 'compliance_link', id, { from_kind, from: from_id, to_kind, to: to_id });
  return { ok: true, id };
}

export type LinkLine = { readonly kind: string; readonly id: string; readonly ref: string | null; readonly label: string };

export function linksFor(db: Db, kind: string, id: string): LinkLine[] {
  const rows = db.all<{ k: string; i: string }>(
    'SELECT to_kind AS k, to_id AS i FROM compliance_links WHERE from_kind = ? AND from_id = ? ' +
      'UNION SELECT from_kind AS k, from_id AS i FROM compliance_links WHERE to_kind = ? AND to_id = ?', [kind, id, kind, id]);
  return rows.map((r) => ({ kind: r.k, id: r.i, ref: refOf(db, r.k, r.i), label: words(LINK_KINDS, r.k, r.k) }));
}
