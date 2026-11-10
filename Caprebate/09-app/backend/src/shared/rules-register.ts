/**
 * THE RULES REGISTERS: WHAT A RULE IS, AND WHAT A SEALED RESULT RECORDS (Phase 161m, 10 Nov 2026).
 *
 * Lakhbir, 6 Nov 2026: "make a change on one thing without breaking others". 09-app/docs/ARCHITECTURE.md rule 6: every
 * tax reading and switch has an id, a version, a date it takes effect from, and who approves it, in one register per
 * area (each area's logic/rules.ts); a sealed result records the engine's version and the version of each rule in force
 * where it was made, so changing a rule never quietly changes a result a client already has.
 *
 *   RuleEntry          one rule as a register lists it
 *   defineRules        builds an area's register, refusing a malformed or repeated entry
 *   ruleValueHash      the fingerprint of a rule's value, pinned per version in architecture/rules-lock.json
 *   resultVersions     what a sealed result records: { engine, rules: { id: version } }
 *   versionChanges     what changed between a sealed result's versions and now, and why
 *   engineVersion      the engine package's own version (09-app/engine/package.json), or null
 *
 * A RULE'S VALUE CHANGES ONLY WITH A NEW VERSION. test/rules/rules-register.test.ts compares every entry with the lock:
 * a value changed under the same version is a red test, and `node tools/rules-record.ts` refuses to re-pin it. Raise
 * the entry's version, say why in `change`, give the date it takes effect from, then record it.
 *
 * Plain tools: no SQL, no sign-in, no HTML.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A rule's value: a switch's position, a reading's position on the test system and elsewhere, a file's name. */
export type RuleValue = boolean | string | number | null | { readonly [k: string]: RuleValue } | readonly RuleValue[];

export type RuleEntry = {
  /** `<area>.<name>`, unique across every register; never reused. */
  readonly id: string;
  /** The area whose register holds it (architecture/modules.json). */
  readonly area: string;
  /** What it decides, in plain words. */
  readonly title: string;
  /** 1, 2, 3: raised by every change to its value. */
  readonly version: number;
  /** YYYY-MM-DD: the day this version takes effect from. */
  readonly effective_from: string;
  /** Who approves it: the tax adviser, the surveyor, the data protection officer, the solicitor, the director, Lakhbir. */
  readonly approver: string;
  /** Where that approval stands, in plain words. */
  readonly approval: string;
  readonly value: RuleValue;
  /** The file whose code reads it. */
  readonly home: string;
  /** Why this version exists. */
  readonly change: string;
  /** The test file that runs the rule both ways (on and off). */
  readonly tested_in: string;
};

export class RulesRegisterError extends Error {}

const ID = /^[a-z][a-z-]*\.[A-Za-z0-9_.-]+$/;
const DATE = /^\d{4}-[01]\d-[0-3]\d$/;

/** An area's register: every entry checked, the whole frozen. A malformed or repeated entry throws as the area loads. */
export function defineRules(area: string, entries: readonly Omit<RuleEntry, 'area'>[]): readonly RuleEntry[] {
  const seen = new Set<string>();
  const out = entries.map((e) => {
    const r: RuleEntry = Object.freeze({ ...e, area });
    if (!ID.test(r.id) || !r.id.startsWith(`${area}.`)) throw new RulesRegisterError(`${r.id}: a rule's id is "${area}.<name>"`);
    if (seen.has(r.id)) throw new RulesRegisterError(`${r.id} is in the ${area} register twice`);
    seen.add(r.id);
    if (!Number.isInteger(r.version) || r.version < 1) throw new RulesRegisterError(`${r.id}: the version is a whole number from 1`);
    if (!DATE.test(r.effective_from) || Number.isNaN(Date.parse(r.effective_from))) throw new RulesRegisterError(`${r.id}: effective_from is a date, YYYY-MM-DD`);
    for (const k of ['title', 'approver', 'approval', 'home', 'change', 'tested_in'] as const) {
      if (typeof r[k] !== 'string' || r[k].trim() === '') throw new RulesRegisterError(`${r.id}: ${k} is empty`);
    }
    return r;
  });
  return Object.freeze(out);
}

/** A value as one canonical text: keys sorted, so the same value always gives the same fingerprint. */
export function canonicalValue(v: RuleValue): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${(v as readonly RuleValue[]).map(canonicalValue).join(',')}]`;
  const o = v as { readonly [k: string]: RuleValue };
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonicalValue(o[k] as RuleValue)}`).join(',')}}`;
}

export function ruleValueHash(e: Pick<RuleEntry, 'value'>): string {
  return createHash('sha256').update(canonicalValue(e.value)).digest('hex');
}

/**
 * A SWITCH'S SETTINGS AS A RULE'S VALUE: its booleans, numbers and nulls, at any depth, and none of its words. A
 * switch's question or "requires" text can be reworded without a new version; its position, its period or its mode
 * cannot.
 */
export function settingsOf(o: object): RuleValue {
  const out: Record<string, RuleValue> = {};
  for (const k of Object.keys(o).sort()) {
    const v = (o as Record<string, unknown>)[k];
    if (typeof v === 'boolean' || typeof v === 'number' || v === null) out[k] = v;
    else if (v !== undefined && typeof v === 'object' && !Array.isArray(v)) {
      const inner = settingsOf(v as object);
      if (inner !== null && typeof inner === 'object' && Object.keys(inner).length > 0) out[k] = inner;
    }
  }
  return out;
}

/** The day the registers began (Phase 161m), and what each first version says. */
export const FIRST_RECORDED_ON = '2026-11-10';
export const FIRST_RECORDED = 'First recorded by Phase 161m, as it already stood; its earlier history is in git.';

/**
 * A SWITCH AS A REGISTER ENTRY: its settings read from the switch where its code lives, so the switch keeps its words
 * (its question, its waiver record) and the register pins its position. Version 1 unless said.
 */
export function switchEntry(o: {
  readonly id: string; readonly title: string; readonly approver: string; readonly approval: string; readonly settings: object;
  readonly home: string; readonly tested_in: string; readonly version?: number; readonly effective_from?: string; readonly change?: string;
}): Omit<RuleEntry, 'area'> {
  return {
    id: o.id, title: o.title, version: o.version ?? 1, effective_from: o.effective_from ?? FIRST_RECORDED_ON, approver: o.approver,
    approval: o.approval, value: settingsOf(o.settings), home: o.home, change: o.change ?? FIRST_RECORDED, tested_in: o.tested_in,
  };
}

/**
 * A MAP OF SWITCHES (one boolean per key) AS ENTRIES, one per key, so a key added to the map is a new rule the lock
 * test finds the same day. `versions` names a key whose position has changed since version 1.
 */
export function mapEntries(o: {
  readonly prefix: string; readonly map: Readonly<Record<string, boolean>>; readonly title: (key: string) => string; readonly approver: string;
  readonly approval: (on: boolean) => string; readonly home: string; readonly tested_in: string;
  readonly versions?: Readonly<Record<string, { readonly version: number; readonly effective_from: string; readonly change: string }>>;
}): Omit<RuleEntry, 'area'>[] {
  return Object.keys(o.map).sort().map((k) => {
    const v = o.versions?.[k];
    return {
      id: `${o.prefix}.${k}`, title: o.title(k), version: v?.version ?? 1, effective_from: v?.effective_from ?? FIRST_RECORDED_ON,
      approver: o.approver, approval: o.approval(o.map[k] === true), value: o.map[k] === true, home: o.home,
      change: v?.change ?? FIRST_RECORDED, tested_in: o.tested_in,
    };
  });
}

/* ------------------------------------------------------------------ the lock */

export type LockVersion = { readonly version: number; readonly value_sha256: string; readonly effective_from: string; readonly recorded: string };
export type RulesLock = { readonly note?: string; readonly rules: Readonly<Record<string, readonly LockVersion[]>>; readonly retired?: Readonly<Record<string, string>> };

/**
 * WHAT IS WRONG BETWEEN THE REGISTERS AND THE LOCK. Empty means every rule's value is the one pinned for its version.
 * The test asks it of the real registers and of planted ones; the record tool refuses to write while a "changed" line
 * stands.
 */
export function lockProblems(entries: readonly RuleEntry[], lock: RulesLock): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const e of entries) {
    if (ids.has(e.id)) out.push(`${e.id}: in two registers`);
    ids.add(e.id);
    const pinned = lock.rules[e.id];
    if (pinned === undefined || pinned.length === 0) { out.push(`${e.id}: not in the lock (new: run node tools/rules-record.ts)`); continue; }
    pinned.forEach((p, i) => { if (p.version !== i + 1) out.push(`${e.id}: the lock's versions are not 1, 2, 3 in order`); });
    const last = pinned[pinned.length - 1] as LockVersion;
    const same = pinned.find((p) => p.version === e.version);
    if (same !== undefined && same.value_sha256 !== ruleValueHash(e)) {
      out.push(`${e.id}: its value changed but its version (${e.version}) did not: raise the version, say why, then run node tools/rules-record.ts`);
    } else if (e.version < last.version) {
      out.push(`${e.id}: version ${e.version} is older than the lock's ${last.version}: a version never goes back`);
    } else if (e.version > last.version) {
      out.push(`${e.id}: version ${e.version} is not in the lock yet: run node tools/rules-record.ts`);
    } else if (same !== undefined && same.effective_from !== e.effective_from) {
      out.push(`${e.id}: version ${e.version} took effect on ${same.effective_from}, not ${e.effective_from}: a version's date never changes`);
    }
  }
  for (const id of Object.keys(lock.rules)) {
    if (!ids.has(id) && lock.retired?.[id] === undefined) out.push(`${id}: in the lock but in no register (retire it in the lock, with the date)`);
  }
  return out;
}

/**
 * THE LOCK AFTER RECORDING: each new rule at version 1, each raised version appended. Refuses (throws) where a value
 * changed under a version the lock already holds, or a version skips or goes back.
 */
export function recordInLock(entries: readonly RuleEntry[], lock: RulesLock, today: string): RulesLock {
  const rules: Record<string, LockVersion[]> = {};
  for (const [id, vs] of Object.entries(lock.rules)) rules[id] = [...vs];
  for (const e of entries) {
    const vs = rules[e.id] ?? [];
    const same = vs.find((p) => p.version === e.version);
    if (same !== undefined) {
      if (same.value_sha256 !== ruleValueHash(e)) throw new RulesRegisterError(`${e.id}: its value changed under version ${e.version}: raise the version first`);
      if (same.effective_from !== e.effective_from) throw new RulesRegisterError(`${e.id}: version ${e.version}'s date changed: a version's date never changes`);
      continue;
    }
    if (e.version !== vs.length + 1) throw new RulesRegisterError(`${e.id}: the next version is ${vs.length + 1}, not ${e.version}`);
    vs.push({ version: e.version, value_sha256: ruleValueHash(e), effective_from: e.effective_from, recorded: today });
    rules[e.id] = vs;
  }
  return { ...(lock.note === undefined ? {} : { note: lock.note }), rules, ...(lock.retired === undefined ? {} : { retired: lock.retired }) };
}

/* ------------------------------------------------------- what a result records */

export type ResultVersions = { readonly engine: string | null; readonly rules: Readonly<Record<string, number>> };

/** What a sealed result records: the engine's version and each rule's version in force where it was made. */
export function resultVersions(entries: readonly RuleEntry[], engine: string | null = engineVersion()): ResultVersions {
  const rules: Record<string, number> = {};
  for (const e of [...entries].sort((a, b) => (a.id < b.id ? -1 : 1))) rules[e.id] = e.version;
  return Object.freeze({ engine, rules: Object.freeze(rules) });
}

/** A stored versions_json read back; null where the result was sealed before Phase 161m recorded them. */
export function readResultVersions(json: string | null | undefined): ResultVersions | null {
  if (json === null || json === undefined) return null;
  try {
    const v = JSON.parse(json) as { engine?: unknown; rules?: unknown };
    const rules: Record<string, number> = {};
    if (v.rules !== null && typeof v.rules === 'object') for (const [k, n] of Object.entries(v.rules)) if (typeof n === 'number') rules[k] = n;
    return { engine: typeof v.engine === 'string' ? v.engine : null, rules };
  } catch { return null; }
}

export type VersionChange = { readonly id: string; readonly title: string; readonly was: string; readonly now: string; readonly why: string };

/**
 * WHAT CHANGED SINCE A RESULT WAS SEALED, AND WHY. The result's own figures never move (they are stored, and every
 * sealed table refuses an edit); this is what a re-run would be made with that the sealed one was not.
 */
export function versionChanges(sealed: ResultVersions, now: ResultVersions, entries: readonly RuleEntry[]): VersionChange[] {
  const out: VersionChange[] = [];
  if (sealed.engine !== now.engine) {
    out.push({ id: 'engine', title: 'The claim calculator', was: sealed.engine ?? 'not known', now: now.engine ?? 'not known',
      why: 'The calculator changed; its change log says what and why.' });
  }
  const byId = new Map(entries.map((e) => [e.id, e] as const));
  const ids = [...new Set([...Object.keys(sealed.rules), ...Object.keys(now.rules)])].sort();
  for (const id of ids) {
    const a = sealed.rules[id];
    const b = now.rules[id];
    if (a === b) continue;
    const e = byId.get(id);
    out.push({
      id, title: e?.title ?? id,
      was: a === undefined ? 'not there' : `version ${a}`, now: b === undefined ? 'retired' : `version ${b}`,
      why: e === undefined ? 'This rule has been retired.' : a === undefined ? 'A rule added since.' : e.change,
    });
  }
  return out;
}

/* ------------------------------------------------------------ the engine's version */

/** The engine package this build ships: a file of the build, never a request path. */
export const ENGINE_PACKAGE_PATH = join(import.meta.dirname, '..', '..', '..', 'engine', 'package.json');

let cachedEngine: string | null | undefined;

/** The engine package's own `version`, or null where it states none. */
export function engineVersion(): string | null {
  if (cachedEngine !== undefined) return cachedEngine;
  try {
    const p = JSON.parse(readFileSync(ENGINE_PACKAGE_PATH, 'utf8')) as { version?: unknown };
    cachedEngine = typeof p.version === 'string' ? p.version : null;
  } catch { cachedEngine = null; }
  return cachedEngine;
}
