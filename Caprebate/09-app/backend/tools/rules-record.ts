/**
 * PHASE 161m: RECORD THE RULES IN THE LOCK. Run from 09-app/backend:
 *   node tools/rules-record.ts           record every new rule (version 1) and every raised version
 *   node tools/rules-record.ts --check   print what is wrong between the registers and the lock; exit 1 if anything
 *
 * architecture/rules-lock.json pins each rule's value for each of its versions (a SHA-256 of the value). A rule whose
 * value changed under a version the lock already holds is REFUSED: raise its version in its area's logic/rules.ts, say
 * why in `change`, give the date it takes effect from, then run this. test/rules/rules-register.test.ts fails until the
 * lock and the registers agree, so a value never changes quietly. Read the diff before committing it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lockProblems, recordInLock, type RulesLock } from '../src/shared/index.ts';
import { allRules } from '../test/rules/all-rules.ts';

const LOCK = fileURLToPath(new URL('../architecture/rules-lock.json', import.meta.url));
const NOTE = 'THE RULES LOCK (Phase 161m, 10 Nov 2026; 09-app/docs/ARCHITECTURE.md rule 6). Every rule in every area\'s logic/rules.ts, with the SHA-256 of its value for each of its versions. Written only by node tools/rules-record.ts, which refuses a value changed under the same version; checked by test/rules/rules-register.test.ts. A retired rule is moved to "retired" with the date, never deleted.';

let lock: RulesLock;
try { lock = JSON.parse(readFileSync(LOCK, 'utf8')) as RulesLock; } catch { lock = { note: NOTE, rules: {} }; }
const entries = allRules();

if (process.argv.includes('--check')) {
  const p = lockProblems(entries, lock);
  for (const line of p) console.log(`  ${line}`);
  console.log(p.length === 0 ? `rules lock: ${entries.length} rules, every value the one pinned for its version` : `rules lock: ${p.length} problem(s)`);
  process.exit(p.length === 0 ? 0 : 1);
}

const today = new Date().toISOString().slice(0, 10);
const before = Object.values(lock.rules).reduce((n, v) => n + v.length, 0);
let next: RulesLock;
try { next = recordInLock(entries, { ...lock, note: NOTE }, today); }
catch (e) { console.error(`REFUSED: ${(e as Error).message}`); process.exit(1); }
const rules: Record<string, unknown> = {};
for (const id of Object.keys(next.rules).sort()) rules[id] = next.rules[id];
writeFileSync(LOCK, `${JSON.stringify({ note: NOTE, rules, ...(next.retired === undefined ? {} : { retired: next.retired }) }, null, 1)}\n`);
const after = Object.values(next.rules).reduce((n, v) => n + v.length, 0);
console.log(`rules lock: ${entries.length} rules; ${after - before} version(s) recorded; written to ${LOCK}`);
