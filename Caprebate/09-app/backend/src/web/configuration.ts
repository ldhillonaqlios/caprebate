/**
 * THE ADMIN SETTINGS SCREEN'S STORE — THE LISTS, THE REASONS, AND WHAT NO SETTING
 * MAY CHANGE. CRM 9 of 10, 12 September 2026.
 *
 * The scope is 09-app/CAPREBATE-CRM-DISPOSITION.md, section 20, and the decisions
 * this file takes are that table's Part E from E119. The screen is
 * src/web/configuration-pages.ts; the lists are src/web/vocabularies.ts and
 * migration 019.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CONFIGURABLE WHERE IT IS A PREFERENCE, FIXED WHERE IT IS A RULE (row 20.6).
 *
 * A PREFERENCE is a value on a list — a lead source, a priority, a task type, a
 * property type, an introducer type — or a lost or exit reason. ADMIN adds one,
 * relabels one or retires one here; SALES reads them. A value is never deleted and
 * its code never changes, because records name it.
 *
 * A RULE is refused BY THE STORE, BY NAME, WITH ITS REASON — not missing from a
 * form. `FORBIDDEN_SETTINGS` is built from the real things: every procedure stage's
 * gate, both register gates, every one of the tax adviser's switches as the engine
 * holds them, every fee control, the reward model, clause 13's clawback, the fee
 * trigger, AML_IN_SCOPE as a general setting, the client's share-progress switch,
 * the public referral form, the invoice-fraud procedure, the reconciliation's 15%
 * threshold, the retention parameters, the boundary of the five roles, a document
 * type's receipt policy, a value-carrying type marked as carrying none, and the
 * claim's fact keys, capture sources and payer classes. Asking for one writes a
 * REFUSED audit line and changes nothing; test/configuration.test.ts asks for every
 * one and reads each thing back unchanged.
 *
 * THE THINGS THIS SCREEN FOLDS IN ARE READ FROM THEIR OWN STORES, never copied: the
 * document types (`typeList`), the automation rules (`rulesPage`), the templates
 * (`templatesPage`), the finance settings (`settingsView`) and the compliance
 * settings (`settingReading`). Each is written where it always was, under its own
 * action, and this screen links there.
 */

import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { authorise, can, type Actor, type Obj } from '../authz.ts';
import { NotFoundAsRefusal } from './backoffice.ts';
import { VOCAB_LISTS, isVocabList, vocabularyValues, type VocabList, type VocabValue } from './vocabularies.ts';
import { PROCEDURE_KEYS, anyStageLabel } from './stages.ts';
import { ctaSwitchReadings } from './engine.ts';
import { FEE_CONTROLS } from './fee-controls.ts';
import { RECIPROCITY_ACTIVITY_TYPES } from './tasks.ts';
import { typeList, type TypeView } from './documents.ts';
import { rulesPage, type RuleView } from './automation.ts';
import { templatesPage } from './templates.ts';
import { settingsView, type SettingsView } from './vat.ts';
import { settingReading, type SettingReading } from './compliance.ts';

export type ConfigDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string };
/** PHASE 133e (D4, continued): `field` is the posted name a refusal is about, where it is about one. */
export type ConfigResult = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly why: string; readonly field?: string };
type Fields = Readonly<Record<string, string | null>>;

const OBJ: Obj = { type: 'configuration', id: 'settings' };

export function assertConfigurationRead(actor: Actor): void {
  authorise(actor, 'configuration.read', OBJ);
}

/* ================================================================== *
 * 1 · WHAT NO SETTING MAY CHANGE
 * ================================================================== */

const GATE_WHY = 'Each step’s check is built into the system and run at every move. A setting could get round it.';
const CTA_WHY = 'A tax adviser’s switch stays off until a chartered tax adviser answers. Changing it is their call and a system change, never a setting.';
const FEE_WHY = 'A fee rule. If a setting could change our pricing, whoever found the setting would decide it.';

export const FORBIDDEN_SETTINGS: Readonly<Record<string, string>> = Object.freeze({
  ...Object.fromEntries(PROCEDURE_KEYS.map((k) => [`STAGE_GATE:${k}`, `${anyStageLabel(k)} — ${GATE_WHY}`])),
  STAGE_LIST: 'There are ten steps, each with its own check and ways out. No setting can add, remove or reorder a step.',
  FREE_REGISTER_GATE: 'No setting can turn on free lookups. They start when our privacy notice is published.',
  PAID_REGISTER_GATE: 'No setting can turn on paid lookups. They need a signed engagement letter and a person to click.',
  ...Object.fromEntries(ctaSwitchReadings().map((s) => [`CTA_SWITCH:${s.switch}`, CTA_WHY])),
  ...Object.fromEntries(Object.keys(FEE_CONTROLS).map((k) => [`FEE_CONTROL:${k}`, FEE_WHY])),
  REWARD_MODEL: 'The introducer reward model is a fee switch. An admin changes it on its own page, and not while clause 1 of the engagement letter is blank.',
  FEE_CLAWBACK: 'Clause 13’s fee clawback stays off until its three blanks are filled in. It is a system change, not a setting.',
  FEE_TRIGGER: 'Lakhbir decided when our fee is earned: when our report is delivered for filing. This is built in, so no setting can change it.',
  AML_IN_SCOPE: 'Does money laundering supervision apply to us? That is set on the compliance page, with a date and a source. It is checked before we take on a client.',
  CLIENT_SHARE_GIVE: 'Clients cannot yet agree to share progress in the portal. That waits on wording our data protection officer agrees.',
  REFERRAL_FORM: 'The public referral form waits on our privacy notice being published. It is not a setting.',
  INVOICE_FRAUD_PROCEDURE: 'Invoice emails wait on our invoice-fraud procedure being in force. Turning them on is a piece of work, not a setting.',
  QUOTE_GAP_REVIEW_PCT: 'The 15% review level is fixed in how we check quotes. It is not a setting.',
  RETENTION_PARAMETERS: 'How long we keep data is signed off by our data protection officer, then built into the system.',
  ROLE_BOUNDARY: 'The staff roles, and what each can do, are built in and checked on every request. A new or wider role is for Lakhbir to decide.',
  DOCUMENT_TYPE_RECEIPT_POLICY: 'Whether we keep a file, or read it and then delete it, is fixed for each document type. Only a system update changes it.',
  DOCUMENT_TYPE_CARRIES_VALUE_UNSET: 'A document type that can hold a claim value, a tax benefit or a fee is never marked as holding none.',
  FACT_KEYS: 'The facts we hold about a claim are built into the system. They are not a list you can edit.',
  CAPTURE_SOURCES: 'The four ways we take in information are fixed. A new one needs a system update.',
  PAYER_CLASSES: 'The payer types in Rulebook F are fixed. A new one needs a system update.',
  RECIPROCITY_KINDS: 'The three things we give back to a firm under reward model A are fixed. They are only for tasks on a firm, and are not task types.',
});

/**
 * PHASE 144a — THE NAME A PERSON READS FOR EACH OF THOSE SETTINGS. The key (STAGE_GATE:INVOICE, FEE_TRIGGER …) is
 * still the value a form posts and the store records; the screen shows this label instead of the key.
 */
const SETTING_LABELS: Readonly<Record<string, string>> = Object.freeze({
  STAGE_LIST: 'The ten steps of a claim',
  FREE_REGISTER_GATE: 'Turning on free lookups',
  PAID_REGISTER_GATE: 'Turning on paid lookups',
  REWARD_MODEL: 'The introducer reward model',
  FEE_CLAWBACK: 'Taking back a fee (clause 13)',
  FEE_TRIGGER: 'When our fee is earned',
  AML_IN_SCOPE: 'Money laundering checks',
  CLIENT_SHARE_GIVE: 'Clients agreeing to share progress',
  REFERRAL_FORM: 'The public referral form',
  INVOICE_FRAUD_PROCEDURE: 'Sending invoices by email',
  QUOTE_GAP_REVIEW_PCT: 'The 15% level for checking quotes',
  RETENTION_PARAMETERS: 'How long we keep data',
  ROLE_BOUNDARY: 'Staff roles and what each can do',
  DOCUMENT_TYPE_RECEIPT_POLICY: 'Keeping a file or deleting it, for each document type',
  DOCUMENT_TYPE_CARRIES_VALUE_UNSET: 'Document types that can hold a value',
  FACT_KEYS: 'The facts we hold about a claim',
  CAPTURE_SOURCES: 'The ways we take in information',
  PAYER_CLASSES: 'The payer types in Rulebook F',
  RECIPROCITY_KINDS: 'What we give back to a firm',
});
const FEE_CONTROL_LABELS: Readonly<Record<string, string>> = Object.freeze({
  above_benefit: 'Fee rule: when our fee is more than the tax saved',
  break_and_abort: 'Fee rule: a claim that is stopped part way',
});

/** The plain name of a setting no screen may move. Never the key itself, unless a new key has no label yet. */
export function settingLabel(key: string): string {
  const [kind, rest] = key.includes(':') ? [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)] : [key, ''];
  if (kind === 'STAGE_GATE') return `The check at the step "${anyStageLabel(rest)}"`;
  if (kind === 'CTA_SWITCH') return `Tax adviser’s switch: ${rest.replace(/_/g, ' ')}`;
  if (kind === 'FEE_CONTROL') return FEE_CONTROL_LABELS[rest] ?? `Fee rule: ${rest.replace(/_/g, ' ')}`;
  return SETTING_LABELS[key] ?? key.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/** Lists a person might ask for that are not configurable, each with the reason. */
const NOT_A_LIST: Readonly<Record<string, string>> = Object.freeze({
  STAGE: FORBIDDEN_SETTINGS['STAGE_LIST'] ?? '',
  EXIT: FORBIDDEN_SETTINGS['STAGE_LIST'] ?? '',
  ROLE: FORBIDDEN_SETTINGS['ROLE_BOUNDARY'] ?? '',
  FACT_KEY: FORBIDDEN_SETTINGS['FACT_KEYS'] ?? '',
  CAPTURE_SOURCE: FORBIDDEN_SETTINGS['CAPTURE_SOURCES'] ?? '',
  PAYER_CLASS: FORBIDDEN_SETTINGS['PAYER_CLASSES'] ?? '',
  DOCUMENT_TYPE: 'Document types have their own page, with who can read each and when it is deleted. Only a system update sets whether we keep the file.',
});

/**
 * ASK FOR A SETTING NO SCREEN MAY MOVE — and be refused by the store, with the reason, on the record. ADMIN only;
 * anyone else is refused by `configuration.write` before a key is read.
 */
export function refuseSetting(d: ConfigDeps, actor: Actor, key: string | null): { readonly ok: false; readonly why: string; readonly field?: string } {
  authorise(actor, 'configuration.write', OBJ);
  const k = (key ?? '').trim();
  const why = FORBIDDEN_SETTINGS[k];
  if (why === undefined) return { ok: false, why: 'That is not a setting this screen holds.', field: 'key' };
  d.audit.append({
    at: d.now(), kind: 'CONFIGURATION_REFUSED', outcome: 'REFUSED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'configuration', object_id: 'settings', detail: { setting: k },
  });
  return { ok: false, why };
}

/* ================================================================== *
 * 2 · THE VIEW
 * ================================================================== */

export type ReasonList = 'LEAD_LOST' | 'CLAIM_EXIT';
export const REASON_LISTS: Readonly<Record<ReasonList, string>> = Object.freeze({
  LEAD_LOST: 'Why a lead is lost',
  CLAIM_EXIT: 'Why a claim leaves the procedure',
});

export type ReasonValue = { readonly code: string; readonly label: string; readonly ord: number; readonly active: boolean; readonly source: string };

export type ConfigurationView = {
  readonly lists: readonly { readonly list: VocabList; readonly label: string; readonly holds: string; readonly values: readonly VocabValue[] }[];
  readonly reasons: readonly { readonly list: ReasonList; readonly label: string; readonly values: readonly ReasonValue[] }[];
  readonly document_types?: readonly TypeView[];
  readonly automation?: { readonly rules: readonly RuleView[]; readonly may_write: boolean };
  readonly templates?: { readonly count: number };
  readonly finance?: SettingsView['current'];
  readonly compliance?: readonly SettingReading[];
  readonly forbidden: readonly { readonly key: string; readonly label: string; readonly why: string }[];
  readonly may_write: boolean;
};

export function configurationView(db: Db, actor: Actor, today: string): ConfigurationView {
  assertConfigurationRead(actor);
  const canType = can(actor, 'document_type.read', { type: 'document_type', id: '__document_types__' });
  const canRules = can(actor, 'automation_rule.read', { type: 'automation_rule', id: '__rules__' });
  const canTemplates = can(actor, 'email_template.read', { type: 'email_template', id: '__templates__' });
  const canFinance = can(actor, 'invoice.read', { type: 'invoice', id: '__settings__', business_id: '__settings__' });
  const canCompliance = can(actor, 'compliance.read', { type: 'compliance', id: 'settings' });
  const rules = canRules ? rulesPage(db, actor) : null;
  return {
    lists: (Object.keys(VOCAB_LISTS) as VocabList[]).map((list) => ({
      list, label: VOCAB_LISTS[list].label, holds: VOCAB_LISTS[list].holds, values: vocabularyValues(db, list),
    })),
    reasons: (Object.keys(REASON_LISTS) as ReasonList[]).map((list) => ({
      list, label: REASON_LISTS[list],
      values: db.all<{ code: string; label: string; ord: number; active: number; source: string }>(
        'SELECT code, label, ord, active, source FROM reason_lists WHERE list = ? ORDER BY ord ASC, code ASC', [list],
      ).map((r) => ({ code: r.code, label: r.label, ord: r.ord, active: r.active === 1, source: r.source })),
    })),
    ...(canType ? { document_types: typeList(db, actor) } : {}),
    ...(rules === null ? {} : { automation: { rules: rules.rules, may_write: rules.may_write } }),
    ...(canTemplates ? { templates: { count: templatesPage(db, actor).templates.length } } : {}),
    ...(canFinance ? { finance: settingsView(db, actor, today).current } : {}),
    ...(canCompliance ? { compliance: [settingReading(db, 'AML_IN_SCOPE', today), settingReading(db, 'INSURANCE_POSITION', today)] } : {}),
    forbidden: Object.entries(FORBIDDEN_SETTINGS).map(([key, why]) => ({ key, label: settingLabel(key), why })),
    may_write: can(actor, 'configuration.write', OBJ),
  };
}

/* ================================================================== *
 * 3 · CHANGING A LIST
 * ================================================================== */

const CODE = /^[A-Z][A-Z0-9_]{1,59}$/;

function clean(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return t === '' ? null : t;
}

function listRefusal(list: string | null): string {
  const asked = (list ?? '').trim().toUpperCase();
  return NOT_A_LIST[asked] ?? 'That is not a list this screen keeps. The lists are the lead sources, the priorities, the task types, the property types and the introducer types.';
}

export function addValue(d: ConfigDeps, actor: Actor, input: Fields): ConfigResult {
  authorise(actor, 'configuration.write', OBJ);
  const list = clean(input['list']);
  if (!isVocabList(list)) return { ok: false, why: listRefusal(list), field: 'list' };
  const code = (clean(input['code']) ?? '').toUpperCase();
  if (!CODE.test(code)) return { ok: false, why: 'A code is capital letters, digits and underscores, starting with a letter — 2 to 60 of them. It never changes once saved.', field: 'code' };
  if (list === 'ACTIVITY_TYPE' && Object.hasOwn(RECIPROCITY_ACTIVITY_TYPES, code)) return { ok: false, why: FORBIDDEN_SETTINGS['RECIPROCITY_KINDS'] ?? '', field: 'code' };
  const label = clean(input['label']);
  if (label === null || label.length > 120) return { ok: false, why: 'Give the value a label of up to 120 characters.', field: 'label' };
  if (d.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM vocabularies WHERE list = ? AND code = ?', [list, code])?.n !== 0) {
    return { ok: false, why: 'That code is already on the list. A retired value is brought back by changing it, not by adding it again.', field: 'code' };
  }
  const at = d.now();
  const ord = (d.db.get<{ n: number | null }>('SELECT MAX(ord) AS n FROM vocabularies WHERE list = ?', [list])?.n ?? 0) + 10;
  d.db.tx(() => {
    d.db.run(
      'INSERT INTO vocabularies (list, code, label, ord, active, fixed, source, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 0, ?, ?, ?)',
      [list, code, label, ord, 'Added by an administrator on the settings screen.', at, at]);
    d.audit.append({
      at, kind: 'CONFIGURATION_VALUE_ADDED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'configuration', object_id: `${list}:${code}`, detail: { list, code },
    });
  });
  return { ok: true, id: `${list}:${code}` };
}

/** A priority an active rule gives its tasks, or an open recurring task carries, is not retired — the next one would be refused. */
function priorityInUse(db: Db, code: string): boolean {
  return db.get<{ n: number }>(
    "SELECT (SELECT COUNT(*) FROM automation_rules WHERE active = 1 AND task_priority = ?) + " +
      "(SELECT COUNT(*) FROM staff_tasks WHERE status IN ('OPEN','IN_PROGRESS') AND recurrence IS NOT NULL AND priority = ?) AS n",
    [code, code])?.n !== 0;
}

export function changeValue(d: ConfigDeps, actor: Actor, listRaw: string, code: string, input: Fields): ConfigResult {
  authorise(actor, 'configuration.write', OBJ);
  if (!isVocabList(listRaw)) return { ok: false, why: listRefusal(listRaw), field: 'list' };
  const list: VocabList = listRaw;
  const r = d.db.get<{ label: string; active: number; fixed: number }>('SELECT label, active, fixed FROM vocabularies WHERE list = ? AND code = ?', [list, code]);
  if (r === undefined) throw new NotFoundAsRefusal();
  const label = Object.hasOwn(input, 'label') ? clean(input['label']) : r.label;
  if (label === null || label.length > 120) return { ok: false, why: 'Give the value a label of up to 120 characters.', field: 'label' };
  const activeRaw = clean(input['active']);
  const active = activeRaw === null ? r.active : activeRaw === '0' || activeRaw === 'no' ? 0 : 1;
  if (active === 0 && r.fixed === 1) return { ok: false, why: 'The application writes this value itself, so it is never retired.', field: 'active' };
  if (active === 0 && r.active === 1 && list === 'PRIORITY' && priorityInUse(d.db, code)) {
    return { ok: false, why: 'An active rule or a repeating task uses this priority. Change those first, or their next task would be refused.' };
  }
  const fields = [...(label !== r.label ? ['label'] : []), ...(active !== r.active ? ['active'] : [])];
  if (fields.length === 0) return { ok: true, id: `${list}:${code}` };
  const at = d.now();
  d.db.tx(() => {
    d.db.run('UPDATE vocabularies SET label = ?, active = ?, updated_at = ? WHERE list = ? AND code = ?', [label, active, at, list, code]);
    d.audit.append({
      at, kind: 'CONFIGURATION_VALUE_CHANGED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'configuration', object_id: `${list}:${code}`, detail: { list, code, fields },
    });
  });
  return { ok: true, id: `${list}:${code}` };
}

/* ================================================================== *
 * 4 · THE LOST AND EXIT REASONS — reason_lists (migration 010), which waited for this screen
 * ================================================================== */

function isReasonList(v: unknown): v is ReasonList {
  return v === 'LEAD_LOST' || v === 'CLAIM_EXIT';
}

export function addReason(d: ConfigDeps, actor: Actor, input: Fields): ConfigResult {
  authorise(actor, 'configuration.write', OBJ);
  const list = clean(input['list']);
  if (!isReasonList(list)) return { ok: false, why: 'A reason belongs to why a lead is lost or why a claim leaves the procedure.', field: 'list' };
  const code = (clean(input['code']) ?? '').toUpperCase();
  if (!/^[A-Z][A-Z_]{1,59}$/.test(code)) return { ok: false, why: 'A reason’s code is capital letters and underscores — 2 to 60. It never changes once saved.', field: 'code' };
  const label = clean(input['label']);
  if (label === null || label.length > 300) return { ok: false, why: 'Give the reason a label of up to 300 characters.', field: 'label' };
  if (d.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM reason_lists WHERE list = ? AND code = ?', [list, code])?.n !== 0) {
    return { ok: false, why: 'That code is already on the list.' };
  }
  const ord = (d.db.get<{ n: number | null }>('SELECT MAX(ord) AS n FROM reason_lists WHERE list = ?', [list])?.n ?? 0) + 10;
  const at = d.now();
  d.db.tx(() => {
    d.db.run('INSERT INTO reason_lists (list, code, label, ord, active, source) VALUES (?, ?, ?, ?, 1, ?)',
      [list, code, label, ord, 'Added by an administrator on the settings screen.']);
    d.audit.append({
      at, kind: 'REASON_ADDED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'configuration', object_id: `${list}:${code}`, detail: { list, code },
    });
  });
  return { ok: true, id: `${list}:${code}` };
}

export function changeReason(d: ConfigDeps, actor: Actor, listRaw: string, code: string, input: Fields): ConfigResult {
  authorise(actor, 'configuration.write', OBJ);
  if (!isReasonList(listRaw)) return { ok: false, why: 'A reason belongs to why a lead is lost or why a claim leaves the procedure.' };
  const r = d.db.get<{ label: string; active: number }>('SELECT label, active FROM reason_lists WHERE list = ? AND code = ?', [listRaw, code]);
  if (r === undefined) throw new NotFoundAsRefusal();
  const label = Object.hasOwn(input, 'label') ? clean(input['label']) : r.label;
  if (label === null || label.length > 300) return { ok: false, why: 'Give the reason a label of up to 300 characters.', field: 'label' };
  const activeRaw = clean(input['active']);
  const active = activeRaw === null ? r.active : activeRaw === '0' || activeRaw === 'no' ? 0 : 1;
  if (active === 0 && code === 'OTHER') return { ok: false, why: '“Another reason” is how a reason nobody listed is still recorded, with a note. It is never retired.' };
  const fields = [...(label !== r.label ? ['label'] : []), ...(active !== r.active ? ['active'] : [])];
  if (fields.length === 0) return { ok: true, id: `${listRaw}:${code}` };
  d.db.tx(() => {
    d.db.run('UPDATE reason_lists SET label = ?, active = ? WHERE list = ? AND code = ?', [label, active, listRaw, code]);
    d.audit.append({
      at: d.now(), kind: 'REASON_CHANGED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'configuration', object_id: `${listRaw}:${code}`, detail: { list: listRaw, code, fields },
    });
  });
  return { ok: true, id: `${listRaw}:${code}` };
}
